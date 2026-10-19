import type { SQLiteDatabase } from 'expo-sqlite';
import {
  PersonalExpense,
  CreatePersonalExpenseInput,
  UpdatePersonalExpenseInput,
  PersonalExpenseFilter,
  ExpenseSummary,
  MonthlySummary,
} from '../domain/types';
import { getMonthDateRange } from '../utils/date';

export interface IPersonalExpenseRepository {
  create(input: CreatePersonalExpenseInput): Promise<PersonalExpense>;
  getById(id: string): Promise<PersonalExpense | null>;
  getAll(filter?: PersonalExpenseFilter): Promise<PersonalExpense[]>;
  update(id: string, input: UpdatePersonalExpenseInput): Promise<PersonalExpense>;
  delete(id: string): Promise<boolean>;
  getMonthlySummary(year: number, month: number): Promise<MonthlySummary>;
  getTotalSummary(): Promise<ExpenseSummary>;
  getExistingIds(): Promise<Set<string>>;
  batchInsert(expenses: PersonalExpense[]): Promise<number>;
}

// Database Row Interface
interface ExpenseDbRow {
  id: string;
  user_id: string;
  title: string;
  description: string;
  amount_paise: number;
  category_id: string;
  expense_date: string;
  created_at: string;
  updated_at: string;
}

function mapRowToExpense(row: ExpenseDbRow): PersonalExpense {
  return {
    id: row.id,
    userId: row.user_id || 'guest',
    title: row.title,
    description: row.description,
    amountPaise: row.amount_paise,
    categoryId: row.category_id,
    expenseDate: row.expense_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function generateExpenseId(): string {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 9);
  return `exp_${timestamp}_${randomStr}`;
}

export class SQLitePersonalExpenseRepository implements IPersonalExpenseRepository {
  constructor(
    private db: SQLiteDatabase,
    private userId: string = 'guest'
  ) {}

  async create(input: CreatePersonalExpenseInput): Promise<PersonalExpense> {
    const id = generateExpenseId();
    const now = new Date().toISOString();
    const title = (input.title || '').trim();
    const description = (input.description || '').trim();
    const activeUser = input.userId || this.userId;

    await this.db.runAsync(
      `INSERT INTO personal_expenses 
        (id, user_id, title, description, amount_paise, category_id, expense_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      activeUser,
      title,
      description,
      input.amountPaise,
      input.categoryId,
      input.expenseDate,
      now,
      now
    );

    return {
      id,
      userId: activeUser,
      title,
      description,
      amountPaise: input.amountPaise,
      categoryId: input.categoryId,
      expenseDate: input.expenseDate,
      createdAt: now,
      updatedAt: now,
    };
  }

  async getById(id: string): Promise<PersonalExpense | null> {
    const row = await this.db.getFirstAsync<ExpenseDbRow>(
      'SELECT * FROM personal_expenses WHERE id = ? AND user_id = ?',
      id,
      this.userId
    );

    if (!row) return null;
    return mapRowToExpense(row);
  }

  async getAll(filter?: PersonalExpenseFilter): Promise<PersonalExpense[]> {
    let query = 'SELECT * FROM personal_expenses WHERE user_id = ?';
    const params: (string | number)[] = [this.userId];

    if (filter?.categoryId) {
      query += ' AND category_id = ?';
      params.push(filter.categoryId);
    }

    if (filter?.year && filter?.month) {
      const { startDate, endDate } = getMonthDateRange(filter.year, filter.month);
      query += ' AND expense_date >= ? AND expense_date <= ?';
      params.push(startDate, endDate);
    } else if (filter?.startDate && filter?.endDate) {
      query += ' AND expense_date >= ? AND expense_date <= ?';
      params.push(filter.startDate, filter.endDate);
    }

    if (filter?.searchQuery) {
      query += ' AND (title LIKE ? OR description LIKE ?)';
      const searchPattern = `%${filter.searchQuery.trim()}%`;
      params.push(searchPattern, searchPattern);
    }

    const sortField = filter?.sortBy === 'amountPaise' ? 'amount_paise' : 'expense_date';
    const sortOrder = filter?.sortOrder === 'ASC' ? 'ASC' : 'DESC';

    query += ` ORDER BY ${sortField} ${sortOrder}, created_at DESC, id ASC`;

    const rows = await this.db.getAllAsync<ExpenseDbRow>(query, ...params);
    return rows.map(mapRowToExpense);
  }

  async update(id: string, input: UpdatePersonalExpenseInput): Promise<PersonalExpense> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error(`Personal expense with ID ${id} not found`);
    }

    const updatedTitle = input.title !== undefined ? input.title.trim() : existing.title;
    const updatedDesc = input.description !== undefined ? input.description.trim() : existing.description;
    const updatedAmount = input.amountPaise !== undefined ? input.amountPaise : existing.amountPaise;
    const updatedCategory = input.categoryId !== undefined ? input.categoryId : existing.categoryId;
    const updatedDate = input.expenseDate !== undefined ? input.expenseDate : existing.expenseDate;
    const now = new Date().toISOString();

    await this.db.runAsync(
      `UPDATE personal_expenses 
       SET title = ?, description = ?, amount_paise = ?, category_id = ?, expense_date = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
      updatedTitle,
      updatedDesc,
      updatedAmount,
      updatedCategory,
      updatedDate,
      now,
      id,
      this.userId
    );

    return {
      id,
      userId: existing.userId,
      title: updatedTitle,
      description: updatedDesc,
      amountPaise: updatedAmount,
      categoryId: updatedCategory,
      expenseDate: updatedDate,
      createdAt: existing.createdAt,
      updatedAt: now,
    };
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.runAsync(
      'DELETE FROM personal_expenses WHERE id = ? AND user_id = ?',
      id,
      this.userId
    );
    return result.changes > 0;
  }

  async getMonthlySummary(year: number, month: number): Promise<MonthlySummary> {
    const { startDate, endDate } = getMonthDateRange(year, month);
    const rows = await this.db.getAllAsync<ExpenseDbRow>(
      'SELECT * FROM personal_expenses WHERE user_id = ? AND expense_date >= ? AND expense_date <= ?',
      this.userId,
      startDate,
      endDate
    );

    let totalAmountPaise = 0;
    const categoryBreakdown: Record<string, { amountPaise: number; count: number }> = {};

    for (const row of rows) {
      totalAmountPaise += row.amount_paise;
      if (!categoryBreakdown[row.category_id]) {
        categoryBreakdown[row.category_id] = { amountPaise: 0, count: 0 };
      }
      categoryBreakdown[row.category_id].amountPaise += row.amount_paise;
      categoryBreakdown[row.category_id].count += 1;
    }

    return {
      year,
      month,
      totalAmountPaise,
      expenseCount: rows.length,
      categoryBreakdown,
    };
  }

  async getTotalSummary(): Promise<ExpenseSummary> {
    const rows = await this.db.getAllAsync<ExpenseDbRow>(
      'SELECT * FROM personal_expenses WHERE user_id = ?',
      this.userId
    );

    let totalAmountPaise = 0;
    const categoryBreakdown: Record<string, { amountPaise: number; count: number }> = {};

    for (const row of rows) {
      totalAmountPaise += row.amount_paise;
      if (!categoryBreakdown[row.category_id]) {
        categoryBreakdown[row.category_id] = { amountPaise: 0, count: 0 };
      }
      categoryBreakdown[row.category_id].amountPaise += row.amount_paise;
      categoryBreakdown[row.category_id].count += 1;
    }

    return {
      totalAmountPaise,
      expenseCount: rows.length,
      categoryBreakdown,
    };
  }

  async getExistingIds(): Promise<Set<string>> {
    const rows = await this.db.getAllAsync<{ id: string }>(
      'SELECT id FROM personal_expenses WHERE user_id = ?',
      this.userId
    );
    return new Set(rows.map((r) => r.id));
  }

  async batchInsert(expenses: PersonalExpense[]): Promise<number> {
    if (!expenses || expenses.length === 0) return 0;

    let inserted = 0;
    await this.db.withTransactionAsync(async () => {
      for (const exp of expenses) {
        const existing = await this.db.getFirstAsync<{ id: string; user_id: string }>(
          'SELECT id, user_id FROM personal_expenses WHERE id = ?',
          exp.id
        );

        let targetId = exp.id;
        if (existing) {
          if (existing.user_id === this.userId) {
            // Already exists for current user -> skip
            continue;
          } else {
            // Belongs to another account on this device -> allocate fresh unique ID to prevent collision
            targetId = generateExpenseId();
          }
        }

        await this.db.runAsync(
          `INSERT INTO personal_expenses 
            (id, user_id, title, description, amount_paise, category_id, expense_date, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          targetId,
          this.userId,
          exp.title,
          exp.description || '',
          exp.amountPaise,
          exp.categoryId,
          exp.expenseDate,
          exp.createdAt,
          exp.updatedAt
        );
        inserted++;
      }
    });

    return inserted;
  }
}

/**
 * In-Memory repository implementation for automated unit & integration testing
 */
export class InMemoryPersonalExpenseRepository implements IPersonalExpenseRepository {
  private expenses: Map<string, PersonalExpense>;

  constructor(
    private userId: string = 'guest',
    sharedStore?: Map<string, PersonalExpense>
  ) {
    this.expenses = sharedStore || new Map();
  }

  async create(input: CreatePersonalExpenseInput): Promise<PersonalExpense> {
    const id = generateExpenseId();
    const now = new Date().toISOString();
    const activeUser = input.userId || this.userId;
    const record: PersonalExpense = {
      id,
      userId: activeUser,
      title: (input.title || '').trim(),
      description: (input.description || '').trim(),
      amountPaise: input.amountPaise,
      categoryId: input.categoryId,
      expenseDate: input.expenseDate,
      createdAt: now,
      updatedAt: now,
    };
    this.expenses.set(id, record);
    return { ...record };
  }

  async getById(id: string): Promise<PersonalExpense | null> {
    const record = this.expenses.get(id);
    if (!record || record.userId !== this.userId) return null;
    return { ...record };
  }

  async getAll(filter?: PersonalExpenseFilter): Promise<PersonalExpense[]> {
    let list = Array.from(this.expenses.values()).filter((e) => e.userId === this.userId);

    if (filter?.categoryId) {
      list = list.filter((e) => e.categoryId === filter.categoryId);
    }

    if (filter?.year && filter?.month) {
      const { startDate, endDate } = getMonthDateRange(filter.year, filter.month);
      list = list.filter((e) => e.expenseDate >= startDate && e.expenseDate <= endDate);
    } else if (filter?.startDate && filter?.endDate) {
      list = list.filter((e) => e.expenseDate >= filter.startDate! && e.expenseDate <= filter.endDate!);
    }

    if (filter?.searchQuery) {
      const q = filter.searchQuery.toLowerCase().trim();
      list = list.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q)
      );
    }

    const sortField = filter?.sortBy === 'amountPaise' ? 'amountPaise' : 'expenseDate';
    const isAsc = filter?.sortOrder === 'ASC';

    list.sort((a, b) => {
      if (sortField === 'amountPaise') {
        const diff = a.amountPaise - b.amountPaise;
        if (diff !== 0) return isAsc ? diff : -diff;
      } else {
        const dateCmp = a.expenseDate.localeCompare(b.expenseDate);
        if (dateCmp !== 0) return isAsc ? dateCmp : -dateCmp;
      }
      const createdCmp = b.createdAt.localeCompare(a.createdAt);
      if (createdCmp !== 0) return createdCmp;
      return a.id.localeCompare(b.id);
    });

    return list.map((e) => ({ ...e }));
  }

  async update(id: string, input: UpdatePersonalExpenseInput): Promise<PersonalExpense> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error(`Personal expense with ID ${id} not found`);
    }

    const now = new Date().toISOString();
    const updated: PersonalExpense = {
      ...existing,
      title: input.title !== undefined ? input.title.trim() : existing.title,
      description: input.description !== undefined ? input.description.trim() : existing.description,
      amountPaise: input.amountPaise !== undefined ? input.amountPaise : existing.amountPaise,
      categoryId: input.categoryId !== undefined ? input.categoryId : existing.categoryId,
      expenseDate: input.expenseDate !== undefined ? input.expenseDate : existing.expenseDate,
      updatedAt: now,
    };

    this.expenses.set(id, updated);
    return { ...updated };
  }

  async delete(id: string): Promise<boolean> {
    const existing = await this.getById(id);
    if (!existing) {
      return false;
    }
    return this.expenses.delete(id);
  }

  async getMonthlySummary(year: number, month: number): Promise<MonthlySummary> {
    const { startDate, endDate } = getMonthDateRange(year, month);
    const list = Array.from(this.expenses.values()).filter(
      (e) => e.userId === this.userId && e.expenseDate >= startDate && e.expenseDate <= endDate
    );

    let totalAmountPaise = 0;
    const categoryBreakdown: Record<string, { amountPaise: number; count: number }> = {};

    for (const item of list) {
      totalAmountPaise += item.amountPaise;
      if (!categoryBreakdown[item.categoryId]) {
        categoryBreakdown[item.categoryId] = { amountPaise: 0, count: 0 };
      }
      categoryBreakdown[item.categoryId].amountPaise += item.amountPaise;
      categoryBreakdown[item.categoryId].count += 1;
    }

    return {
      year,
      month,
      totalAmountPaise,
      expenseCount: list.length,
      categoryBreakdown,
    };
  }

  async getTotalSummary(): Promise<ExpenseSummary> {
    const list = Array.from(this.expenses.values()).filter((e) => e.userId === this.userId);
    let totalAmountPaise = 0;
    const categoryBreakdown: Record<string, { amountPaise: number; count: number }> = {};

    for (const item of list) {
      totalAmountPaise += item.amountPaise;
      if (!categoryBreakdown[item.categoryId]) {
        categoryBreakdown[item.categoryId] = { amountPaise: 0, count: 0 };
      }
      categoryBreakdown[item.categoryId].amountPaise += item.amountPaise;
      categoryBreakdown[item.categoryId].count += 1;
    }

    return {
      totalAmountPaise,
      expenseCount: list.length,
      categoryBreakdown,
    };
  }

  async getExistingIds(): Promise<Set<string>> {
    const ids = new Set<string>();
    for (const exp of this.expenses.values()) {
      if (exp.userId === this.userId) {
        ids.add(exp.id);
      }
    }
    return ids;
  }

  async batchInsert(expenses: PersonalExpense[]): Promise<number> {
    if (!expenses || expenses.length === 0) return 0;

    // Snapshot for atomic transaction rollback simulation
    const snapshot = new Map(this.expenses);
    let inserted = 0;
    try {
      for (const exp of expenses) {
        let targetId = exp.id;
        if (this.expenses.has(exp.id)) {
          const existing = this.expenses.get(exp.id)!;
          if (existing.userId === this.userId) {
            // Already exists for this user -> skip (safe merge, never duplicate)
            continue;
          } else {
            // Belongs to another user on device -> allocate new ID to preserve isolation
            targetId = generateExpenseId();
          }
        }
        this.expenses.set(targetId, {
          ...exp,
          id: targetId,
          userId: this.userId,
          description: exp.description || '',
        });
        inserted++;
      }
      return inserted;
    } catch (err) {
      // Revert to snapshot on transaction failure
      this.expenses = snapshot;
      throw err;
    }
  }
}

import { InMemoryPersonalExpenseRepository } from '../src/repositories/personal-expense-repository';

describe('Personal Expense Repository — CRUD & Summaries', () => {
  let repo: InMemoryPersonalExpenseRepository;

  beforeEach(() => {
    repo = new InMemoryPersonalExpenseRepository();
  });

  test('creates and retrieves personal expense by ID', async () => {
    const expense = await repo.create({
      title: 'Lunch',
      description: 'Hostel mess lunch',
      amountPaise: 12000, // ₹120.00
      categoryId: 'food',
      expenseDate: '2026-10-10',
    });

    expect(expense.id).toBeDefined();
    expect(expense.title).toBe('Lunch');
    expect(expense.amountPaise).toBe(12000);
    expect(expense.categoryId).toBe('food');

    const fetched = await repo.getById(expense.id);
    expect(fetched).toEqual(expense);
  });

  test('updates an existing expense correctly', async () => {
    const created = await repo.create({
      title: 'Old Title',
      amountPaise: 5000,
      categoryId: 'travel',
      expenseDate: '2026-10-01',
    });

    const updated = await repo.update(created.id, {
      title: 'Updated Title',
      amountPaise: 7500,
      categoryId: 'groceries',
    });

    expect(updated.id).toBe(created.id);
    expect(updated.title).toBe('Updated Title');
    expect(updated.amountPaise).toBe(7500);
    expect(updated.categoryId).toBe('groceries');
    expect(updated.expenseDate).toBe('2026-10-01');

    const fetched = await repo.getById(created.id);
    expect(fetched?.title).toBe('Updated Title');
    expect(fetched?.amountPaise).toBe(7500);
  });

  test('deletes an expense correctly', async () => {
    const created = await repo.create({
      title: 'To be deleted',
      amountPaise: 1000,
      categoryId: 'other',
      expenseDate: '2026-10-05',
    });

    const deleted = await repo.delete(created.id);
    expect(deleted).toBe(true);

    const fetched = await repo.getById(created.id);
    expect(fetched).toBeNull();
  });

  test('filters by category and date range', async () => {
    await repo.create({
      title: 'Oct Food',
      amountPaise: 2000,
      categoryId: 'food',
      expenseDate: '2026-10-05',
    });
    await repo.create({
      title: 'Oct Rent',
      amountPaise: 500000,
      categoryId: 'rent',
      expenseDate: '2026-10-01',
    });
    await repo.create({
      title: 'Sept Food',
      amountPaise: 3000,
      categoryId: 'food',
      expenseDate: '2026-09-20',
    });

    // Filter by food category only
    const foodExpenses = await repo.getAll({ categoryId: 'food' });
    expect(foodExpenses.length).toBe(2);

    // Filter by October 2026 only
    const octExpenses = await repo.getAll({ year: 2026, month: 10 });
    expect(octExpenses.length).toBe(2);

    // Filter by Food + October 2026
    const octFood = await repo.getAll({ categoryId: 'food', year: 2026, month: 10 });
    expect(octFood.length).toBe(1);
    expect(octFood[0].title).toBe('Oct Food');
  });

  test('calculates accurate monthly and total summaries using integer paise', async () => {
    await repo.create({
      title: 'Food 1',
      amountPaise: 15050, // ₹150.50
      categoryId: 'food',
      expenseDate: '2026-10-02',
    });
    await repo.create({
      title: 'Food 2',
      amountPaise: 24950, // ₹249.50
      categoryId: 'food',
      expenseDate: '2026-10-05',
    });
    await repo.create({
      title: 'Books',
      amountPaise: 60000, // ₹600.00
      categoryId: 'academic',
      expenseDate: '2026-10-15',
    });
    await repo.create({
      title: 'Last Month',
      amountPaise: 10000, // ₹100.00
      categoryId: 'food',
      expenseDate: '2026-09-10',
    });

    const summary = await repo.getMonthlySummary(2026, 10);
    // 15050 + 24950 + 60000 = 100000 paise (₹1,000.00)
    expect(summary.totalAmountPaise).toBe(100000);
    expect(summary.expenseCount).toBe(3);
    expect(summary.categoryBreakdown.food.amountPaise).toBe(40000);
    expect(summary.categoryBreakdown.food.count).toBe(2);
    expect(summary.categoryBreakdown.academic.amountPaise).toBe(60000);
    expect(summary.categoryBreakdown.academic.count).toBe(1);

    const totalSummary = await repo.getTotalSummary();
    // 100000 + 10000 = 110000 paise
    expect(totalSummary.totalAmountPaise).toBe(110000);
    expect(totalSummary.expenseCount).toBe(4);
  });
});

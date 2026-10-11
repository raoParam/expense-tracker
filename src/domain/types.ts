export interface PersonalExpense {
  id: string;
  userId: string; // Firebase UID or 'guest'
  title: string;
  description: string;
  amountPaise: number; // Stored strictly as integer paise (e.g., ₹10.50 -> 1050)
  categoryId: string;
  expenseDate: string; // ISO 8601 YYYY-MM-DD
  createdAt: string; // ISO 8601 UTC timestamp
  updatedAt: string; // ISO 8601 UTC timestamp
}

export interface CreatePersonalExpenseInput {
  userId?: string;
  title?: string;
  description?: string;
  amountPaise: number;
  categoryId: string;
  expenseDate: string; // YYYY-MM-DD
}

export interface UpdatePersonalExpenseInput {
  title?: string;
  description?: string;
  amountPaise?: number;
  categoryId?: string;
  expenseDate?: string;
}

export interface PersonalExpenseFilter {
  categoryId?: string;
  year?: number;
  month?: number; // 1-12
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  searchQuery?: string;
  sortBy?: 'expenseDate' | 'amountPaise' | 'createdAt';
  sortOrder?: 'ASC' | 'DESC';
}

export interface ExpenseSummary {
  totalAmountPaise: number;
  expenseCount: number;
  categoryBreakdown: Record<string, { amountPaise: number; count: number }>;
}

export interface MonthlySummary {
  year: number;
  month: number;
  totalAmountPaise: number;
  expenseCount: number;
  categoryBreakdown: Record<string, { amountPaise: number; count: number }>;
}

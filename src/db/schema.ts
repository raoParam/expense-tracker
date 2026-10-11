export const DB_NAME = 'hostel_expense.db';
export const CURRENT_SCHEMA_VERSION = 2;

export const CREATE_MIGRATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);
`;

export const MIGRATION_V1 = `
CREATE TABLE IF NOT EXISTS personal_expenses (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  amount_paise INTEGER NOT NULL,
  category_id TEXT NOT NULL,
  expense_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_personal_expenses_date 
  ON personal_expenses(expense_date DESC);

CREATE INDEX IF NOT EXISTS idx_personal_expenses_category 
  ON personal_expenses(category_id);

CREATE INDEX IF NOT EXISTS idx_personal_expenses_created 
  ON personal_expenses(created_at DESC);
`;

export const MIGRATION_V2 = `
ALTER TABLE personal_expenses ADD COLUMN user_id TEXT NOT NULL DEFAULT 'guest';

CREATE INDEX IF NOT EXISTS idx_personal_expenses_user_date 
  ON personal_expenses(user_id, expense_date DESC);

CREATE INDEX IF NOT EXISTS idx_personal_expenses_user_cat 
  ON personal_expenses(user_id, category_id);
`;

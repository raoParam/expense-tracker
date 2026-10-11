import { LIMITS } from '../constants/limits';
import { CATEGORIES, DEFAULT_CATEGORY_ID, getCategoryById } from '../constants/categories';
import { CreatePersonalExpenseInput, UpdatePersonalExpenseInput } from './types';
import { validateRupeeInput } from './money';

export interface FormValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
  cleanedInput?: {
    title: string;
    description: string;
    amountPaise: number;
    categoryId: string;
    expenseDate: string;
  };
}

export function isValidISODateString(dateStr: string): boolean {
  if (!dateStr || typeof dateStr !== 'string') return false;
  // Strict check for YYYY-MM-DD
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr)) return false;

  const [year, month, day] = dateStr.split('-').map(Number);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

export function validatePersonalExpenseForm(
  rupeeAmountStr: string,
  categoryId: string,
  expenseDate: string,
  title?: string,
  description?: string
): FormValidationResult {
  const errors: Record<string, string> = {};

  // 1. Amount validation
  const amountResult = validateRupeeInput(rupeeAmountStr);
  if (!amountResult.isValid || amountResult.paise === undefined) {
    errors.amount = amountResult.error || 'Invalid amount';
  }

  // 2. Category validation
  const validCategory = CATEGORIES.some((c) => c.id === categoryId);
  const resolvedCategoryId = validCategory ? categoryId : DEFAULT_CATEGORY_ID;

  // 3. Date validation
  if (!expenseDate || !isValidISODateString(expenseDate)) {
    errors.expenseDate = 'Please select a valid date (YYYY-MM-DD)';
  }

  // 4. Title validation (optional, max 30 chars)
  const trimmedTitle = (title || '').trim();
  if (trimmedTitle.length > LIMITS.MAX_TITLE_LENGTH) {
    errors.title = `Title cannot exceed ${LIMITS.MAX_TITLE_LENGTH} characters (currently ${trimmedTitle.length})`;
  }

  // If title is empty, default title to category name
  const finalTitle = trimmedTitle || getCategoryById(resolvedCategoryId).name;

  // 5. Description validation (optional, max 300 chars)
  const trimmedDesc = (description || '').trim();
  if (trimmedDesc.length > LIMITS.MAX_DESCRIPTION_LENGTH) {
    errors.description = `Description cannot exceed ${LIMITS.MAX_DESCRIPTION_LENGTH} characters (currently ${trimmedDesc.length})`;
  }

  const isValid = Object.keys(errors).length === 0;

  return {
    isValid,
    errors,
    cleanedInput: isValid
      ? {
          title: finalTitle,
          description: trimmedDesc,
          amountPaise: amountResult.paise!,
          categoryId: resolvedCategoryId,
          expenseDate,
        }
      : undefined,
  };
}

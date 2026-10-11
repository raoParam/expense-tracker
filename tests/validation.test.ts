import {
  validatePersonalExpenseForm,
  isValidISODateString,
} from '../src/domain/validation';
import { LIMITS } from '../src/constants/limits';

describe('Validation Domain', () => {
  describe('isValidISODateString', () => {
    test('accepts valid YYYY-MM-DD dates', () => {
      expect(isValidISODateString('2026-10-10')).toBe(true);
      expect(isValidISODateString('2025-01-01')).toBe(true);
      expect(isValidISODateString('2024-02-29')).toBe(true); // Leap year
    });

    test('rejects invalid or non-existent calendar dates', () => {
      expect(isValidISODateString('2025-02-29')).toBe(false); // Not a leap year
      expect(isValidISODateString('2026-13-01')).toBe(false); // Invalid month
      expect(isValidISODateString('2026-04-31')).toBe(false); // April has 30 days
      expect(isValidISODateString('10-10-2026')).toBe(false);
      expect(isValidISODateString('invalid')).toBe(false);
      expect(isValidISODateString('')).toBe(false);
    });
  });

  describe('validatePersonalExpenseForm', () => {
    test('validates and cleans a valid expense form', () => {
      const result = validatePersonalExpenseForm(
        '250.50',
        'food',
        '2026-10-10',
        'Dinner at Mess',
        'Special Sunday dinner'
      );

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual({});
      expect(result.cleanedInput).toEqual({
        title: 'Dinner at Mess',
        description: 'Special Sunday dinner',
        amountPaise: 25050,
        categoryId: 'food',
        expenseDate: '2026-10-10',
      });
    });

    test('defaults empty title to Category Name', () => {
      const result = validatePersonalExpenseForm(
        '100',
        'groceries',
        '2026-10-10',
        '', // Empty title
        ''
      );

      expect(result.isValid).toBe(true);
      expect(result.cleanedInput?.title).toBe('Groceries & Supplies');
    });

    test('rejects titles exceeding 30 characters', () => {
      const longTitle = 'A'.repeat(LIMITS.MAX_TITLE_LENGTH + 1);
      const result = validatePersonalExpenseForm(
        '100',
        'food',
        '2026-10-10',
        longTitle
      );

      expect(result.isValid).toBe(false);
      expect(result.errors.title).toBeDefined();
    });

    test('rejects descriptions exceeding 300 characters', () => {
      const longDesc = 'D'.repeat(LIMITS.MAX_DESCRIPTION_LENGTH + 1);
      const result = validatePersonalExpenseForm(
        '100',
        'food',
        '2026-10-10',
        'Valid Title',
        longDesc
      );

      expect(result.isValid).toBe(false);
      expect(result.errors.description).toBeDefined();
    });

    test('returns multiple errors when multiple fields are invalid', () => {
      const result = validatePersonalExpenseForm(
        '-50', // Negative amount
        'food',
        'invalid-date', // Bad date
        'A'.repeat(50) // Too long title
      );

      expect(result.isValid).toBe(false);
      expect(result.errors.amount).toBeDefined();
      expect(result.errors.expenseDate).toBeDefined();
      expect(result.errors.title).toBeDefined();
    });
  });
});

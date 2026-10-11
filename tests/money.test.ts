import {
  validateRupeeInput,
  rupeesToPaise,
  paiseToRupees,
  formatINR,
} from '../src/domain/money';
import { LIMITS } from '../src/constants/limits';

describe('Monetary Domain — Rupees & Integer Paise', () => {
  describe('validateRupeeInput & rupeesToPaise', () => {
    test('converts whole rupee amounts to integer paise', () => {
      expect(rupeesToPaise('1')).toBe(100);
      expect(rupeesToPaise('50')).toBe(5000);
      expect(rupeesToPaise('500')).toBe(50000);
      expect(rupeesToPaise('100000')).toBe(10000000);
    });

    test('converts decimal rupee amounts (1 or 2 decimals) accurately without floating point errors', () => {
      expect(rupeesToPaise('0.01')).toBe(1);
      expect(rupeesToPaise('0.5')).toBe(50);
      expect(rupeesToPaise('0.50')).toBe(50);
      expect(rupeesToPaise('10.25')).toBe(1025);
      expect(rupeesToPaise('123.45')).toBe(12345);
      expect(rupeesToPaise('99.9')).toBe(9990);
    });

    test('accepts maximum valid boundary ₹99,999,999.99', () => {
      const maxPaise = rupeesToPaise('99999999.99');
      expect(maxPaise).toBe(LIMITS.MAX_EXPENSE_PAISE);
      expect(maxPaise).toBe(9999999999);
    });

    test('accepts minimum valid boundary ₹0.01 (1 paisa)', () => {
      const minPaise = rupeesToPaise('0.01');
      expect(minPaise).toBe(LIMITS.MIN_EXPENSE_PAISE);
      expect(minPaise).toBe(1);
    });

    test('rejects zero amount (expenses must be >= 1 paisa)', () => {
      expect(validateRupeeInput('0').isValid).toBe(false);
      expect(validateRupeeInput('0.00').isValid).toBe(false);
      expect(() => rupeesToPaise('0')).toThrow();
    });

    test('rejects negative amounts', () => {
      expect(validateRupeeInput('-50').isValid).toBe(false);
      expect(validateRupeeInput('-0.01').isValid).toBe(false);
      expect(() => rupeesToPaise('-100')).toThrow();
    });

    test('rejects inputs with more than 2 decimal places (no silent rounding)', () => {
      const result = validateRupeeInput('10.555');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('more than 2 decimal places');
      expect(() => rupeesToPaise('10.123')).toThrow();
    });

    test('rejects inputs exceeding maximum limit ₹99,999,999.99', () => {
      expect(validateRupeeInput('100000000').isValid).toBe(false);
      expect(validateRupeeInput('100000000.00').isValid).toBe(false);
      expect(validateRupeeInput('999999999').isValid).toBe(false);
      expect(() => rupeesToPaise('100000000')).toThrow();
    });

    test('rejects empty, malformed, non-numeric, or invalid inputs', () => {
      expect(validateRupeeInput('').isValid).toBe(false);
      expect(validateRupeeInput('   ').isValid).toBe(false);
      expect(validateRupeeInput('abc').isValid).toBe(false);
      expect(validateRupeeInput('12.34.56').isValid).toBe(false);
      expect(validateRupeeInput('₹500').isValid).toBe(false);
      expect(validateRupeeInput('NaN').isValid).toBe(false);
      expect(validateRupeeInput('Infinity').isValid).toBe(false);
    });
  });

  describe('paiseToRupees conversion', () => {
    test('converts integer paise back to decimal rupee strings', () => {
      expect(paiseToRupees(1)).toBe('0.01');
      expect(paiseToRupees(50)).toBe('0.50');
      expect(paiseToRupees(100)).toBe('1.00');
      expect(paiseToRupees(12345)).toBe('123.45');
      expect(paiseToRupees(9999999999)).toBe('99999999.99');
    });

    test('throws if given non-integer paise', () => {
      expect(() => paiseToRupees(12.34)).toThrow('must be an integer');
    });
  });

  describe('formatINR Indian Currency Formatting', () => {
    test('formats amounts with ₹ symbol and Indian comma grouping', () => {
      expect(formatINR(1)).toBe('₹0.01');
      expect(formatINR(50)).toBe('₹0.50');
      expect(formatINR(10000)).toBe('₹100.00');
      expect(formatINR(100000)).toBe('₹1,000.00');
      expect(formatINR(1000000)).toBe('₹10,000.00');
      expect(formatINR(10000000)).toBe('₹1,00,000.00');
      expect(formatINR(100000000)).toBe('₹10,00,000.00');
      expect(formatINR(1000000000)).toBe('₹1,00,00,000.00');
      expect(formatINR(9999999999)).toBe('₹9,99,99,999.99');
    });

    test('supports formatting without ₹ symbol when requested', () => {
      expect(formatINR(1234567, false)).toBe('12,345.67');
    });
  });
});

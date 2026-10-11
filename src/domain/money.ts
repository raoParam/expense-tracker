import { LIMITS } from '../constants/limits';

export interface MonetaryValidationResult {
  isValid: boolean;
  paise?: number;
  error?: string;
}

/**
 * Validates a user-facing rupee string input.
 * Rules:
 * - Must be non-empty and trimmed.
 * - Must not be negative (no minus sign).
 * - Must be a valid numeric string with at most 2 decimal places.
 * - Must be >= 0.01 (1 paisa).
 * - Must be <= 99,999,999.99 (9,999,999,999 paise).
 */
export function validateRupeeInput(input: string | number): MonetaryValidationResult {
  if (input === null || input === undefined) {
    return { isValid: false, error: 'Amount is required' };
  }

  const str = String(input).trim();
  if (str === '') {
    return { isValid: false, error: 'Amount is required' };
  }

  // Reject negative numbers
  if (str.startsWith('-')) {
    return { isValid: false, error: 'Amount cannot be negative' };
  }

  // Must match integer or decimal with up to 2 decimal places
  // e.g. "100", "100.5", "100.50", "0.50", ".50"
  const regex = /^(?:\d+|\d*\.\d+)$/;
  if (!regex.test(str)) {
    return { isValid: false, error: 'Enter a valid numeric amount' };
  }

  const parts = str.split('.');
  const wholePart = parts[0] === '' ? '0' : parts[0];
  const decimalPart = parts.length > 1 ? parts[1] : '';

  // Reject more than 2 decimal places (do not silently round)
  if (decimalPart.length > 2) {
    return { isValid: false, error: 'Amount cannot have more than 2 decimal places' };
  }

  // Reject whole parts longer than 8 digits
  // Clean leading zeroes for whole part length check
  const normalizedWhole = wholePart.replace(/^0+/, '') || '0';
  if (normalizedWhole.length > 8) {
    return { isValid: false, error: 'Amount cannot exceed ₹99,999,999.99 (max 8 whole digits)' };
  }

  const wholeNum = parseInt(normalizedWhole, 10);
  if (isNaN(wholeNum) || !isFinite(wholeNum)) {
    return { isValid: false, error: 'Invalid numeric value' };
  }

  // Pad decimal part to 2 digits (e.g., "5" -> "50", "" -> "00")
  const paddedDecimal = decimalPart.padEnd(2, '0');
  const decimalNum = parseInt(paddedDecimal, 10);

  // Safe integer paise calculation without floating point inaccuracy
  const paise = wholeNum * 100 + decimalNum;

  if (paise < LIMITS.MIN_EXPENSE_PAISE) {
    return { isValid: false, error: 'Amount must be at least ₹0.01 (1 paisa)' };
  }

  if (paise > LIMITS.MAX_EXPENSE_PAISE) {
    return { isValid: false, error: 'Amount exceeds maximum limit of ₹99,999,999.99' };
  }

  return { isValid: true, paise };
}

/**
 * Converts a rupee input string/number to integer paise.
 * Throws an Error if input is invalid.
 */
export function rupeesToPaise(input: string | number): number {
  const result = validateRupeeInput(input);
  if (!result.isValid || result.paise === undefined) {
    throw new Error(result.error || 'Invalid rupee amount');
  }
  return result.paise;
}

/**
 * Converts integer paise to a clean rupee string (e.g. 1050 -> "10.50").
 */
export function paiseToRupees(paise: number): string {
  if (!Number.isInteger(paise)) {
    throw new Error(`Paise must be an integer, received: ${paise}`);
  }

  const isNegative = paise < 0;
  const absPaise = Math.abs(paise);
  const whole = Math.floor(absPaise / 100);
  const fraction = absPaise % 100;
  const fractionStr = fraction.toString().padStart(2, '0');

  return `${isNegative ? '-' : ''}${whole}.${fractionStr}`;
}

/**
 * Formats an amount in integer paise using Indian currency convention:
 * - Includes '₹' symbol.
 * - Uses Indian digit grouping (e.g., ₹1,00,000.00).
 * - Exactly 2 decimal places.
 */
export function formatINR(paise: number, showSymbol = true): string {
  if (!Number.isInteger(paise)) {
    paise = Math.round(paise);
  }

  const isNegative = paise < 0;
  const absPaise = Math.abs(paise);
  const whole = Math.floor(absPaise / 100);
  const fraction = absPaise % 100;
  const fractionStr = fraction.toString().padStart(2, '0');

  // Indian digit grouping for whole number part:
  // Last 3 digits, then groups of 2 digits
  const wholeStr = whole.toString();
  let formattedWhole = '';

  if (wholeStr.length <= 3) {
    formattedWhole = wholeStr;
  } else {
    const lastThree = wholeStr.substring(wholeStr.length - 3);
    const otherNumbers = wholeStr.substring(0, wholeStr.length - 3);
    const withCommas = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    formattedWhole = `${withCommas},${lastThree}`;
  }

  const prefix = isNegative ? '-₹' : showSymbol ? '₹' : '';
  return `${prefix}${formattedWhole}.${fractionStr}`;
}

import { AppError } from '../middleware/errorHandler';
import { SplitType } from '../models/Expense';

export interface SplitInputItem {
  userId: string;
  amountPaise?: number;
  sharePaise?: number;
  percentage?: number; // Up to 2 decimal places, e.g. 33.33
  quantity?: number;
  unitPricePaise?: number;
}

export interface CalculatedShare {
  userId: string;
  sharePaise: number;
}

export const MAX_AMOUNT_PAISE = 9999999999; // ₹99,999,999.99

/**
 * Calculates deterministic, exact-paisa shares across participants
 * ensuring sum(shares) === totalAmountPaise and zero floating-point error.
 */
export function calculateShares(
  splitType: SplitType,
  totalAmountPaise: number,
  participants: SplitInputItem[],
  payerId: string
): CalculatedShare[] {
  // Validate total amount
  if (!Number.isInteger(totalAmountPaise) || totalAmountPaise <= 0 || totalAmountPaise > MAX_AMOUNT_PAISE) {
    throw new AppError(
      'Expense amount must be an integer between 1 paisa and ₹99,999,999.99 (9,999,999,999 paise)',
      400,
      'INVALID_AMOUNT'
    );
  }

  // Validate distinct participants (min 2 distinct, must include payer)
  const uniqueUserIds = Array.from(new Set(participants.map((p) => p.userId.trim())));
  if (uniqueUserIds.length < 2) {
    throw new AppError(
      'Shared expenses require at least 2 distinct participants (including the payer)',
      400,
      'INSUFFICIENT_PARTICIPANTS'
    );
  }

  if (!uniqueUserIds.includes(payerId)) {
    throw new AppError(
      'The payer must be included in the participant split',
      400,
      'PAYER_NOT_IN_PARTICIPANTS'
    );
  }

  // Stable sort by userId ascending for deterministic remainder distribution
  const sortedUserIds = [...uniqueUserIds].sort((a, b) => a.localeCompare(b));
  const participantCount = sortedUserIds.length;

  let calculatedShares: CalculatedShare[] = [];

  switch (splitType) {
    case 'equal': {
      const baseShare = Math.floor(totalAmountPaise / participantCount);
      const remainder = totalAmountPaise % participantCount;

      calculatedShares = sortedUserIds.map((userId, index) => ({
        userId,
        sharePaise: baseShare + (index < remainder ? 1 : 0),
      }));
      break;
    }

    case 'custom': {
      const userShareMap = new Map<string, number>();
      let allocatedTotal = 0;

      for (const item of participants) {
        const uId = item.userId.trim();
        const amt = item.sharePaise !== undefined ? item.sharePaise : item.amountPaise;

        if (amt === undefined || !Number.isInteger(amt) || amt < 0 || amt > MAX_AMOUNT_PAISE) {
          throw new AppError(
            `Custom share amount for user ${uId} must be a non-negative integer in paise`,
            400,
            'INVALID_CUSTOM_SHARE'
          );
        }

        userShareMap.set(uId, (userShareMap.get(uId) || 0) + amt);
        allocatedTotal += amt;
      }

      if (allocatedTotal !== totalAmountPaise) {
        throw new AppError(
          `Custom split total (${allocatedTotal} paise) must exactly equal expense total (${totalAmountPaise} paise)`,
          400,
          'SPLIT_TOTAL_MISMATCH'
        );
      }

      calculatedShares = sortedUserIds.map((userId) => ({
        userId,
        sharePaise: userShareMap.get(userId) || 0,
      }));
      break;
    }

    case 'percentage': {
      const userPctMap = new Map<string, number>();
      let totalBasisPoints = 0; // Work in basis points (100.00% = 10,000 basis points)

      for (const item of participants) {
        const uId = item.userId.trim();
        const pct = item.percentage;

        if (pct === undefined || typeof pct !== 'number' || isNaN(pct) || pct < 0 || pct > 100) {
          throw new AppError(
            `Percentage for user ${uId} must be a valid number between 0 and 100%`,
            400,
            'INVALID_PERCENTAGE'
          );
        }

        // Enforce maximum 2 decimal places (e.g. 33.33)
        const roundedBasisPoints = Math.round(pct * 100);
        if (Math.abs(pct * 100 - roundedBasisPoints) > 0.0001) {
          throw new AppError(
            `Percentage for user ${uId} can have at most 2 decimal places (e.g. 33.33%)`,
            400,
            'INVALID_PERCENTAGE_DECIMALS'
          );
        }

        userPctMap.set(uId, (userPctMap.get(uId) || 0) + roundedBasisPoints);
        totalBasisPoints += roundedBasisPoints;
      }

      if (totalBasisPoints !== 10000) {
        throw new AppError(
          `Total percentage must sum to exactly 100.00% (currently ${(totalBasisPoints / 100).toFixed(2)}%)`,
          400,
          'PERCENTAGE_SUM_MISMATCH'
        );
      }

      // Calculate integer paise shares
      let sumCalculated = 0;
      const initialShares = sortedUserIds.map((userId) => {
        const basisPoints = userPctMap.get(userId) || 0;
        const share = Math.floor((totalAmountPaise * basisPoints) / 10000);
        sumCalculated += share;
        return { userId, sharePaise: share };
      });

      // Distribute remainder paise in stable ascending userId order
      const remainder = totalAmountPaise - sumCalculated;
      calculatedShares = initialShares.map((item, index) => ({
        userId: item.userId,
        sharePaise: item.sharePaise + (index < remainder ? 1 : 0),
      }));
      break;
    }

    case 'quantity': {
      const userQuantityMap = new Map<string, number>();
      let totalItemizedPaise = 0;

      for (const item of participants) {
        const uId = item.userId.trim();
        const qty = item.quantity;
        const unitPrice = item.unitPricePaise;

        if (qty === undefined || !Number.isInteger(qty) || qty <= 0) {
          throw new AppError(
            `Item quantity for user ${uId} must be a positive integer`,
            400,
            'INVALID_QUANTITY'
          );
        }

        if (unitPrice === undefined || !Number.isInteger(unitPrice) || unitPrice < 0) {
          throw new AppError(
            `Unit price for user ${uId} must be a non-negative integer in paise`,
            400,
            'INVALID_UNIT_PRICE'
          );
        }

        const itemTotal = qty * unitPrice;
        userQuantityMap.set(uId, (userQuantityMap.get(uId) || 0) + itemTotal);
        totalItemizedPaise += itemTotal;
      }

      if (totalItemizedPaise !== totalAmountPaise) {
        throw new AppError(
          `Itemized quantity total (${totalItemizedPaise} paise) must exactly equal expense total (${totalAmountPaise} paise)`,
          400,
          'QUANTITY_TOTAL_MISMATCH'
        );
      }

      calculatedShares = sortedUserIds.map((userId) => ({
        userId,
        sharePaise: userQuantityMap.get(userId) || 0,
      }));
      break;
    }

    default:
      throw new AppError(`Unsupported split type: ${splitType}`, 400, 'INVALID_SPLIT_TYPE');
  }

  // Strict Conservation of Money Verification
  const totalAllocated = calculatedShares.reduce((sum, s) => sum + s.sharePaise, 0);
  if (totalAllocated !== totalAmountPaise) {
    throw new AppError(
      `Internal calculation error: allocated shares (${totalAllocated} paise) do not equal total amount (${totalAmountPaise} paise)`,
      500,
      'CALCULATION_ERROR'
    );
  }

  return calculatedShares;
}

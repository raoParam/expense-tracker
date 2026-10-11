import { validateRupeeInput } from './money';

export type SplitType = 'equal' | 'custom' | 'percentage' | 'quantity';

export interface SplitParticipantInput {
  userId: string;
  displayName?: string;
  email?: string;
  amountRupees?: string; // string input in UI
  amountPaise?: number;
  percentage?: string; // string input in UI
  percentageNum?: number;
  quantity?: string; // string input in UI
  quantityNum?: number;
  unitPriceRupees?: string; // string input in UI
  unitPricePaise?: number;
  selected?: boolean;
}

export interface CalculatedClientShare {
  userId: string;
  displayName?: string;
  sharePaise: number;
}

/**
 * Calculates deterministic shares on client for live preview and validation
 */
export function calculateClientShares(
  splitType: SplitType,
  totalAmountPaise: number,
  participants: SplitParticipantInput[],
  payerId: string
): { shares: CalculatedClientShare[]; error?: string } {
  const selected = participants.filter((p) => p.selected !== false);

  if (selected.length < 2) {
    return { shares: [], error: 'Select at least 2 participants (including payer)' };
  }

  const hasPayer = selected.some((p) => p.userId === payerId);
  if (!hasPayer) {
    return { shares: [], error: 'Payer must be included in participants' };
  }

  if (!totalAmountPaise || totalAmountPaise <= 0) {
    return { shares: [], error: 'Enter a valid expense amount' };
  }

  // Sort ascending by userId for deterministic remainder distribution
  const sorted = [...selected].sort((a, b) => a.userId.localeCompare(b.userId));

  switch (splitType) {
    case 'equal': {
      const base = Math.floor(totalAmountPaise / sorted.length);
      const rem = totalAmountPaise % sorted.length;
      const shares = sorted.map((p, idx) => ({
        userId: p.userId,
        displayName: p.displayName,
        sharePaise: base + (idx < rem ? 1 : 0),
      }));
      return { shares };
    }

    case 'custom': {
      let totalAllocated = 0;
      const shares: CalculatedClientShare[] = [];

      for (const p of sorted) {
        let paise = 0;
        if (p.amountPaise !== undefined) {
          paise = p.amountPaise;
        } else if (p.amountRupees !== undefined && p.amountRupees.trim() !== '') {
          const str = p.amountRupees.trim();
          if (str === '0' || str === '0.00' || str === '0.0') {
            paise = 0;
          } else {
            const valRes = validateRupeeInput(str);
            if (!valRes.isValid || valRes.paise === undefined) {
              return { shares: [], error: `Invalid amount for ${p.displayName || p.userId}: ${valRes.error}` };
            }
            paise = valRes.paise;
          }
        } else {
          paise = 0;
        }

        if (paise < 0) {
          return { shares: [], error: `Share amount for ${p.displayName || p.userId} cannot be negative` };
        }

        totalAllocated += paise;
        shares.push({
          userId: p.userId,
          displayName: p.displayName,
          sharePaise: paise,
        });
      }

      if (totalAllocated !== totalAmountPaise) {
        const diffPaise = totalAmountPaise - totalAllocated;
        const diffRupees = (Math.abs(diffPaise) / 100).toFixed(2);
        return {
          shares,
          error: diffPaise > 0 ? `₹${diffRupees} remaining to allocate` : `₹${diffRupees} over allocated`,
        };
      }

      return { shares };
    }

    case 'percentage': {
      let totalBasisPoints = 0;
      const participantBasisPoints: { p: SplitParticipantInput; bp: number }[] = [];

      for (const p of sorted) {
        const pctNum = p.percentageNum !== undefined ? p.percentageNum : parseFloat(p.percentage || '0');
        if (isNaN(pctNum) || pctNum < 0 || pctNum > 100) {
          return { shares: [], error: `Invalid percentage for ${p.displayName || p.userId}` };
        }

        const bp = Math.round(pctNum * 100);
        participantBasisPoints.push({ p, bp });
        totalBasisPoints += bp;
      }

      if (totalBasisPoints !== 10000) {
        const currentPct = (totalBasisPoints / 100).toFixed(2);
        return {
          shares: [],
          error: `Total percentage must equal 100.00% (currently ${currentPct}%)`,
        };
      }

      let sumCalculated = 0;
      const initialShares = participantBasisPoints.map(({ p, bp }) => {
        const share = Math.floor((totalAmountPaise * bp) / 10000);
        sumCalculated += share;
        return { userId: p.userId, displayName: p.displayName, sharePaise: share };
      });

      const rem = totalAmountPaise - sumCalculated;
      const shares = initialShares.map((item, idx) => ({
        userId: item.userId,
        displayName: item.displayName,
        sharePaise: item.sharePaise + (idx < rem ? 1 : 0),
      }));

      return { shares };
    }

    case 'quantity': {
      let totalItemized = 0;
      const shares: CalculatedClientShare[] = [];

      for (const p of sorted) {
        const qty = p.quantityNum !== undefined ? p.quantityNum : parseInt(p.quantity || '0', 10);
        let unitPaise = 0;
        if (p.unitPricePaise !== undefined) {
          unitPaise = p.unitPricePaise;
        } else if (p.unitPriceRupees !== undefined && p.unitPriceRupees.trim() !== '') {
          const str = p.unitPriceRupees.trim();
          if (str === '0' || str === '0.00') {
            unitPaise = 0;
          } else {
            const valRes = validateRupeeInput(str);
            if (!valRes.isValid || valRes.paise === undefined) {
              return { shares: [], error: `Invalid unit price for ${p.displayName || p.userId}: ${valRes.error}` };
            }
            unitPaise = valRes.paise;
          }
        }

        if (isNaN(qty) || qty <= 0 || unitPaise < 0) {
          return { shares: [], error: `Invalid item details for ${p.displayName || p.userId}` };
        }

        const itemTotal = qty * unitPaise;
        totalItemized += itemTotal;
        shares.push({
          userId: p.userId,
          displayName: p.displayName,
          sharePaise: itemTotal,
        });
      }

      if (totalItemized !== totalAmountPaise) {
        const diffPaise = totalAmountPaise - totalItemized;
        const diffRupees = (Math.abs(diffPaise) / 100).toFixed(2);
        return {
          shares,
          error: diffPaise > 0 ? `₹${diffRupees} remaining to itemize` : `₹${diffRupees} over itemized`,
        };
      }

      return { shares };
    }

    default:
      return { shares: [], error: 'Invalid split type' };
  }
}

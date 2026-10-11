import { calculateShares, SplitInputItem } from '../src/services/splitCalculator';

describe('Split Calculator Engine (Integer Arithmetic & Remainder Distribution)', () => {
  describe('Equal Splits', () => {
    test('exact division without remainder', () => {
      const participants: SplitInputItem[] = [
        { userId: 'user_a' },
        { userId: 'user_b' },
        { userId: 'user_c' },
      ];
      const shares = calculateShares('equal', 300, participants, 'user_a');
      expect(shares).toEqual([
        { userId: 'user_a', sharePaise: 100 },
        { userId: 'user_b', sharePaise: 100 },
        { userId: 'user_c', sharePaise: 100 },
      ]);
      expect(shares.reduce((sum, s) => sum + s.sharePaise, 0)).toBe(300);
    });

    test('distributes remainder paise in stable ascending user-ID order', () => {
      // Amount: 100 paise across 3 users -> 33 each + 1 remainder
      // Ascending user IDs: user_1, user_2, user_3 -> user_1 gets +1
      const participants: SplitInputItem[] = [
        { userId: 'user_3' },
        { userId: 'user_1' },
        { userId: 'user_2' },
      ];
      const shares = calculateShares('equal', 100, participants, 'user_1');

      expect(shares).toEqual([
        { userId: 'user_1', sharePaise: 34 },
        { userId: 'user_2', sharePaise: 33 },
        { userId: 'user_3', sharePaise: 33 },
      ]);
      expect(shares.reduce((sum, s) => sum + s.sharePaise, 0)).toBe(100);
    });

    test('distributes 2 remainder paise to first two users in ascending order', () => {
      // Amount: 101 paise across 3 users -> 33 each + 2 remainder
      // user_1 gets 34, user_2 gets 34, user_3 gets 33
      const participants: SplitInputItem[] = [
        { userId: 'user_2' },
        { userId: 'user_3' },
        { userId: 'user_1' },
      ];
      const shares = calculateShares('equal', 101, participants, 'user_1');

      expect(shares).toEqual([
        { userId: 'user_1', sharePaise: 34 },
        { userId: 'user_2', sharePaise: 34 },
        { userId: 'user_3', sharePaise: 33 },
      ]);
      expect(shares.reduce((sum, s) => sum + s.sharePaise, 0)).toBe(101);
    });
  });

  describe('Custom Splits', () => {
    test('accepts exact custom sum in paise', () => {
      const participants: SplitInputItem[] = [
        { userId: 'user_a', amountPaise: 150 },
        { userId: 'user_b', amountPaise: 250 },
      ];
      const shares = calculateShares('custom', 400, participants, 'user_a');
      expect(shares).toEqual([
        { userId: 'user_a', sharePaise: 150 },
        { userId: 'user_b', sharePaise: 250 },
      ]);
      expect(shares.reduce((sum, s) => sum + s.sharePaise, 0)).toBe(400);
    });

    test('accepts ₹550 split as ₹300 and ₹250 (55000 paise -> 30000 and 25000 paise) using sharePaise and amountPaise', () => {
      const participantsWithSharePaise: SplitInputItem[] = [
        { userId: 'user_payer', sharePaise: 30000 },
        { userId: 'user_peer', sharePaise: 25000 },
      ];
      const shares1 = calculateShares('custom', 55000, participantsWithSharePaise, 'user_payer');
      expect(shares1).toEqual([
        { userId: 'user_payer', sharePaise: 30000 },
        { userId: 'user_peer', sharePaise: 25000 },
      ]);
      expect(shares1.reduce((sum, s) => sum + s.sharePaise, 0)).toBe(55000);

      const participantsWithAmountPaise: SplitInputItem[] = [
        { userId: 'user_payer', amountPaise: 30000 },
        { userId: 'user_peer', amountPaise: 25000 },
      ];
      const shares2 = calculateShares('custom', 55000, participantsWithAmountPaise, 'user_payer');
      expect(shares2).toEqual([
        { userId: 'user_payer', sharePaise: 30000 },
        { userId: 'user_peer', sharePaise: 25000 },
      ]);
      expect(shares2.reduce((sum, s) => sum + s.sharePaise, 0)).toBe(55000);
    });

    test('rejects negative custom share amounts', () => {
      const participants: SplitInputItem[] = [
        { userId: 'user_a', sharePaise: -1000 },
        { userId: 'user_b', sharePaise: 6000 },
      ];
      expect(() => calculateShares('custom', 5000, participants, 'user_a')).toThrow(
        /non-negative integer/i
      );
    });

    test('rejects non-integer / floating-point custom share amounts', () => {
      const participants: SplitInputItem[] = [
        { userId: 'user_a', sharePaise: 2500.5 },
        { userId: 'user_b', sharePaise: 2499.5 },
      ];
      expect(() => calculateShares('custom', 5000, participants, 'user_a')).toThrow(
        /non-negative integer/i
      );
    });

    test('throws error when custom shares do not sum to total amount', () => {
      const participants: SplitInputItem[] = [
        { userId: 'user_a', amountPaise: 100 },
        { userId: 'user_b', amountPaise: 200 },
      ];
      expect(() => calculateShares('custom', 400, participants, 'user_a')).toThrow(
        /Custom split total.*must exactly equal expense total/i
      );
    });
  });

  describe('Percentage Splits', () => {
    test('exact 50.00% / 50.00% split', () => {
      const participants: SplitInputItem[] = [
        { userId: 'user_a', percentage: 50 },
        { userId: 'user_b', percentage: 50 },
      ];
      const shares = calculateShares('percentage', 1000, participants, 'user_a');
      expect(shares).toEqual([
        { userId: 'user_a', sharePaise: 500 },
        { userId: 'user_b', sharePaise: 500 },
      ]);
      expect(shares.reduce((sum, s) => sum + s.sharePaise, 0)).toBe(1000);
    });

    test('33.33% / 33.33% / 33.34% split on 1000 paise distributes remainder deterministically', () => {
      const participants: SplitInputItem[] = [
        { userId: 'user_b', percentage: 33.33 },
        { userId: 'user_a', percentage: 33.33 },
        { userId: 'user_c', percentage: 33.34 },
      ];
      const shares = calculateShares('percentage', 1000, participants, 'user_a');
      // 33.33% of 1000 = 333 paise (floor)
      // 33.34% of 1000 = 333 paise (floor) -> sum 999 -> 1 remainder -> allocated to user_a (first in sorted)
      expect(shares.reduce((sum, s) => sum + s.sharePaise, 0)).toBe(1000);
    });

    test('rejects percentages not summing to 100.00%', () => {
      const participants: SplitInputItem[] = [
        { userId: 'user_a', percentage: 50 },
        { userId: 'user_b', percentage: 40 },
      ];
      expect(() => calculateShares('percentage', 1000, participants, 'user_a')).toThrow(
        /Total percentage must sum to exactly 100\.00%/i
      );
    });

    test('rejects percentages with more than 2 decimal places', () => {
      const participants: SplitInputItem[] = [
        { userId: 'user_a', percentage: 33.333 },
        { userId: 'user_b', percentage: 66.667 },
      ];
      expect(() => calculateShares('percentage', 1000, participants, 'user_a')).toThrow(
        /at most 2 decimal places/i
      );
    });
  });

  describe('Quantity Splits', () => {
    test('calculates exact item totals based on quantity and unit price', () => {
      const participants: SplitInputItem[] = [
        { userId: 'user_a', quantity: 2, unitPricePaise: 150 }, // 300
        { userId: 'user_b', quantity: 1, unitPricePaise: 200 }, // 200
      ];
      const shares = calculateShares('quantity', 500, participants, 'user_a');
      expect(shares).toEqual([
        { userId: 'user_a', sharePaise: 300 },
        { userId: 'user_b', sharePaise: 200 },
      ]);
      expect(shares.reduce((sum, s) => sum + s.sharePaise, 0)).toBe(500);
    });

    test('throws error when itemized sum does not match total amount', () => {
      const participants: SplitInputItem[] = [
        { userId: 'user_a', quantity: 2, unitPricePaise: 100 }, // 200
        { userId: 'user_b', quantity: 1, unitPricePaise: 100 }, // 100 != 400
      ];
      expect(() => calculateShares('quantity', 400, participants, 'user_a')).toThrow(
        /Itemized quantity total.*must exactly equal expense total/i
      );
    });
  });

  describe('Boundary & Invariant Rules', () => {
    test('max amount ₹99,999,999.99 (9,999,999,999 paise)', () => {
      const participants: SplitInputItem[] = [
        { userId: 'user_1' },
        { userId: 'user_2' },
      ];
      const shares = calculateShares('equal', 9999999999, participants, 'user_1');
      expect(shares.reduce((sum, s) => sum + s.sharePaise, 0)).toBe(9999999999);
      expect(shares[0].sharePaise + shares[1].sharePaise).toBe(9999999999);
    });

    test('rejects amount exceeding max limit', () => {
      const participants: SplitInputItem[] = [
        { userId: 'user_1' },
        { userId: 'user_2' },
      ];
      expect(() => calculateShares('equal', 10000000000, participants, 'user_1')).toThrow(
        /Expense amount must be an integer between 1 paisa and/i
      );
    });

    test('requires at least 2 participants', () => {
      expect(() => calculateShares('equal', 500, [{ userId: 'user_1' }], 'user_1')).toThrow(
        /at least 2 distinct participants/i
      );
    });

    test('rejects duplicate participant user IDs', () => {
      expect(() =>
        calculateShares('equal', 500, [{ userId: 'user_1' }, { userId: 'user_1' }], 'user_1')
      ).toThrow(/at least 2 distinct participants/i);
    });
  });
});

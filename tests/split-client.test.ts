import { calculateClientShares, SplitParticipantInput } from '../src/domain/split';

describe('Client Split Engine & Live Preview Calculations', () => {
  const payerId = 'user_payer';

  describe('Equal Split', () => {
    test('splits 30000 paise among 3 selected participants', () => {
      const participants: SplitParticipantInput[] = [
        { userId: 'user_payer', displayName: 'Payer', selected: true },
        { userId: 'user_b', displayName: 'User B', selected: true },
        { userId: 'user_c', displayName: 'User C', selected: true },
      ];

      const { shares, error } = calculateClientShares('equal', 30000, participants, payerId);

      expect(error).toBeUndefined();
      expect(shares.length).toBe(3);
      expect(shares.reduce((s, item) => s + item.sharePaise, 0)).toBe(30000);
      expect(shares.every((s) => s.sharePaise === 10000)).toBe(true);
    });

    test('distributes remainder 1 paisa in ascending userId order', () => {
      const participants: SplitParticipantInput[] = [
        { userId: 'user_c', displayName: 'User C', selected: true },
        { userId: 'user_payer', displayName: 'Payer', selected: true },
        { userId: 'user_b', displayName: 'User B', selected: true },
      ];

      const { shares, error } = calculateClientShares('equal', 100, participants, payerId);

      expect(error).toBeUndefined();
      expect(shares.reduce((s, item) => s + item.sharePaise, 0)).toBe(100);
      // Sorted userIds: user_b, user_c, user_payer
      expect(shares[0].userId).toBe('user_b');
      expect(shares[0].sharePaise).toBe(34);
      expect(shares[1].userId).toBe('user_c');
      expect(shares[1].sharePaise).toBe(33);
      expect(shares[2].userId).toBe('user_payer');
      expect(shares[2].sharePaise).toBe(33);
    });
  });

  describe('Custom Split', () => {
    test('accepts matching rupee allocations', () => {
      const participants: SplitParticipantInput[] = [
        { userId: 'user_payer', displayName: 'Payer', selected: true, amountRupees: '150.00' },
        { userId: 'user_b', displayName: 'User B', selected: true, amountRupees: '250.00' },
      ];

      const { shares, error } = calculateClientShares('custom', 40000, participants, payerId);

      expect(error).toBeUndefined();
      expect(shares.length).toBe(2);
      expect(shares[0].sharePaise + shares[1].sharePaise).toBe(40000);
    });

    test('accepts ₹550 split as ₹300 and ₹250 (55000 paise -> 30000 and 25000 paise)', () => {
      const participants: SplitParticipantInput[] = [
        { userId: 'user_payer', displayName: 'Payer', selected: true, amountRupees: '300' },
        { userId: 'user_b', displayName: 'User B', selected: true, amountRupees: '250.00' },
      ];

      const { shares, error } = calculateClientShares('custom', 55000, participants, payerId);

      expect(error).toBeUndefined();
      expect(shares.length).toBe(2);
      expect(shares.find((s) => s.userId === 'user_payer')?.sharePaise).toBe(30000);
      expect(shares.find((s) => s.userId === 'user_b')?.sharePaise).toBe(25000);
      expect(shares.reduce((sum, s) => sum + s.sharePaise, 0)).toBe(55000);
    });

    test('rejects negative custom rupee input', () => {
      const participants: SplitParticipantInput[] = [
        { userId: 'user_payer', displayName: 'Payer', selected: true, amountRupees: '-50' },
        { userId: 'user_b', displayName: 'User B', selected: true, amountRupees: '600' },
      ];

      const { error } = calculateClientShares('custom', 55000, participants, payerId);
      expect(error).toMatch(/Amount cannot be negative/i);
    });

    test('rejects custom rupee input with more than 2 decimal places', () => {
      const participants: SplitParticipantInput[] = [
        { userId: 'user_payer', displayName: 'Payer', selected: true, amountRupees: '300.005' },
        { userId: 'user_b', displayName: 'User B', selected: true, amountRupees: '249.995' },
      ];

      const { error } = calculateClientShares('custom', 55000, participants, payerId);
      expect(error).toMatch(/cannot have more than 2 decimal places/i);
    });

    test('returns remaining amount error when allocation is incomplete', () => {
      const participants: SplitParticipantInput[] = [
        { userId: 'user_payer', displayName: 'Payer', selected: true, amountRupees: '100.00' },
        { userId: 'user_b', displayName: 'User B', selected: true, amountRupees: '100.00' },
      ];

      const { error } = calculateClientShares('custom', 40000, participants, payerId);

      expect(error).toMatch(/remaining to allocate/i);
    });
  });

  describe('Percentage Split', () => {
    test('accepts exact 100.00% split', () => {
      const participants: SplitParticipantInput[] = [
        { userId: 'user_payer', displayName: 'Payer', selected: true, percentage: '60' },
        { userId: 'user_b', displayName: 'User B', selected: true, percentage: '40' },
      ];

      const { shares, error } = calculateClientShares('percentage', 50000, participants, payerId);

      expect(error).toBeUndefined();
      expect(shares.reduce((s, item) => s + item.sharePaise, 0)).toBe(50000);
    });

    test('returns error when percentage does not equal 100.00%', () => {
      const participants: SplitParticipantInput[] = [
        { userId: 'user_payer', displayName: 'Payer', selected: true, percentage: '50' },
        { userId: 'user_b', displayName: 'User B', selected: true, percentage: '40' },
      ];

      const { error } = calculateClientShares('percentage', 50000, participants, payerId);

      expect(error).toMatch(/Total percentage must equal 100\.00%/i);
    });
  });

  describe('Quantity Split', () => {
    test('calculates itemized total correctly', () => {
      const participants: SplitParticipantInput[] = [
        { userId: 'user_payer', displayName: 'Payer', selected: true, quantity: '2', unitPriceRupees: '100.00' },
        { userId: 'user_b', displayName: 'User B', selected: true, quantity: '1', unitPriceRupees: '200.00' },
      ];

      const { shares, error } = calculateClientShares('quantity', 40000, participants, payerId);

      expect(error).toBeUndefined();
      expect(shares.reduce((s, item) => s + item.sharePaise, 0)).toBe(40000);
    });
  });

  describe('Validation & Invariants', () => {
    test('fails if fewer than 2 participants selected', () => {
      const participants: SplitParticipantInput[] = [
        { userId: 'user_payer', displayName: 'Payer', selected: true },
        { userId: 'user_b', displayName: 'User B', selected: false },
      ];

      const { error } = calculateClientShares('equal', 1000, participants, payerId);
      expect(error).toMatch(/Select at least 2 participants/i);
    });

    test('fails if payer is not selected', () => {
      const participants: SplitParticipantInput[] = [
        { userId: 'user_payer', displayName: 'Payer', selected: false },
        { userId: 'user_b', displayName: 'User B', selected: true },
        { userId: 'user_c', displayName: 'User C', selected: true },
      ];

      const { error } = calculateClientShares('equal', 1000, participants, payerId);
      expect(error).toMatch(/Payer must be included/i);
    });
  });
});

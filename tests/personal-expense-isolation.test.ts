import { InMemoryPersonalExpenseRepository } from '../src/repositories/personal-expense-repository';
import { PersonalExpense } from '../src/domain/types';

describe('Personal Expense — Multi-Account & Guest Isolation', () => {
  let sharedStore: Map<string, PersonalExpense>;
  let repoAlice: InMemoryPersonalExpenseRepository;
  let repoBob: InMemoryPersonalExpenseRepository;
  let repoGuest: InMemoryPersonalExpenseRepository;

  beforeEach(() => {
    // Shared underlying storage simulating the single on-device SQLite database
    sharedStore = new Map();
    repoAlice = new InMemoryPersonalExpenseRepository('uid_alice_123', sharedStore);
    repoBob = new InMemoryPersonalExpenseRepository('uid_bob_456', sharedStore);
    repoGuest = new InMemoryPersonalExpenseRepository('guest', sharedStore);
  });

  test('each account creates expenses scoped to its own userId', async () => {
    const expAlice = await repoAlice.create({
      title: 'Alice Lunch',
      amountPaise: 15000,
      categoryId: 'food',
      expenseDate: '2026-10-10',
    });

    const expBob = await repoBob.create({
      title: 'Bob Books',
      amountPaise: 45000,
      categoryId: 'academic',
      expenseDate: '2026-10-10',
    });

    const expGuest = await repoGuest.create({
      title: 'Guest Coffee',
      amountPaise: 5000,
      categoryId: 'food',
      expenseDate: '2026-10-10',
    });

    expect(expAlice.userId).toBe('uid_alice_123');
    expect(expBob.userId).toBe('uid_bob_456');
    expect(expGuest.userId).toBe('guest');

    // Total expenses across all users stored in database = 3
    expect(sharedStore.size).toBe(3);
  });

  test('getAll returns only expenses belonging to active account identity', async () => {
    await repoAlice.create({ title: 'Alice Exp 1', amountPaise: 1000, categoryId: 'food', expenseDate: '2026-10-01' });
    await repoAlice.create({ title: 'Alice Exp 2', amountPaise: 2000, categoryId: 'travel', expenseDate: '2026-10-02' });

    await repoBob.create({ title: 'Bob Exp 1', amountPaise: 3000, categoryId: 'food', expenseDate: '2026-10-03' });

    await repoGuest.create({ title: 'Guest Exp 1', amountPaise: 4000, categoryId: 'other', expenseDate: '2026-10-04' });

    // Alice sees only her 2 expenses
    const aliceList = await repoAlice.getAll();
    expect(aliceList.length).toBe(2);
    expect(aliceList.map((e) => e.title)).toEqual(['Alice Exp 2', 'Alice Exp 1']);

    // Bob sees only his 1 expense
    const bobList = await repoBob.getAll();
    expect(bobList.length).toBe(1);
    expect(bobList[0].title).toBe('Bob Exp 1');

    // Guest sees only guest expense
    const guestList = await repoGuest.getAll();
    expect(guestList.length).toBe(1);
    expect(guestList[0].title).toBe('Guest Exp 1');
  });

  test('getById returns null when attempting to access another account’s expense', async () => {
    const aliceExpense = await repoAlice.create({
      title: 'Secret Alice Expense',
      amountPaise: 99900,
      categoryId: 'other',
      expenseDate: '2026-10-10',
    });

    // Alice can fetch it
    const aliceFetched = await repoAlice.getById(aliceExpense.id);
    expect(aliceFetched).not.toBeNull();
    expect(aliceFetched?.title).toBe('Secret Alice Expense');

    // Bob and Guest cannot access it by ID
    const bobFetched = await repoBob.getById(aliceExpense.id);
    expect(bobFetched).toBeNull();

    const guestFetched = await repoGuest.getById(aliceExpense.id);
    expect(guestFetched).toBeNull();
  });

  test('update fails and throws error when modifying another account’s expense', async () => {
    const aliceExpense = await repoAlice.create({
      title: 'Original Title',
      amountPaise: 5000,
      categoryId: 'food',
      expenseDate: '2026-10-10',
    });

    // Bob tries to update Alice's expense
    await expect(
      repoBob.update(aliceExpense.id, { title: 'Hacked Title', amountPaise: 1 })
    ).rejects.toThrow(`Personal expense with ID ${aliceExpense.id} not found`);

    // Verify Alice's expense remains unchanged
    const untouched = await repoAlice.getById(aliceExpense.id);
    expect(untouched?.title).toBe('Original Title');
    expect(untouched?.amountPaise).toBe(5000);
  });

  test('delete fails and returns false when attempting to delete another account’s expense', async () => {
    const aliceExpense = await repoAlice.create({
      title: 'Alice Expense to Keep',
      amountPaise: 12000,
      categoryId: 'rent',
      expenseDate: '2026-10-01',
    });

    // Bob tries to delete Alice's expense
    const bobDeleteResult = await repoBob.delete(aliceExpense.id);
    expect(bobDeleteResult).toBe(false);

    // Guest tries to delete Alice's expense
    const guestDeleteResult = await repoGuest.delete(aliceExpense.id);
    expect(guestDeleteResult).toBe(false);

    // Alice's expense is still intact
    const stillExists = await repoAlice.getById(aliceExpense.id);
    expect(stillExists).not.toBeNull();

    // Alice deletes her own expense
    const aliceDeleteResult = await repoAlice.delete(aliceExpense.id);
    expect(aliceDeleteResult).toBe(true);
    expect(await repoAlice.getById(aliceExpense.id)).toBeNull();
  });

  test('monthly and total summaries are strictly scoped to the active account', async () => {
    // Alice: ₹100 + ₹200 = ₹300 (30,000 paise)
    await repoAlice.create({ title: 'A1', amountPaise: 10000, categoryId: 'food', expenseDate: '2026-10-01' });
    await repoAlice.create({ title: 'A2', amountPaise: 20000, categoryId: 'travel', expenseDate: '2026-10-05' });

    // Bob: ₹500 (50,000 paise)
    await repoBob.create({ title: 'B1', amountPaise: 50000, categoryId: 'food', expenseDate: '2026-10-02' });

    // Guest: ₹50 (5,000 paise)
    await repoGuest.create({ title: 'G1', amountPaise: 5000, categoryId: 'other', expenseDate: '2026-10-03' });

    // Alice summary
    const aliceSummary = await repoAlice.getMonthlySummary(2026, 10);
    expect(aliceSummary.totalAmountPaise).toBe(30000);
    expect(aliceSummary.expenseCount).toBe(2);
    expect(aliceSummary.categoryBreakdown.food.amountPaise).toBe(10000);
    expect(aliceSummary.categoryBreakdown.travel.amountPaise).toBe(20000);

    // Bob summary
    const bobSummary = await repoBob.getMonthlySummary(2026, 10);
    expect(bobSummary.totalAmountPaise).toBe(50000);
    expect(bobSummary.expenseCount).toBe(1);

    // Guest summary
    const guestSummary = await repoGuest.getMonthlySummary(2026, 10);
    expect(guestSummary.totalAmountPaise).toBe(5000);
    expect(guestSummary.expenseCount).toBe(1);
  });

  test('legacy migration simulation: unassigned/guest legacy expenses belong to guest and are isolated from new users', async () => {
    // Simulate legacy records in database prior to migration V2 (with default 'guest')
    sharedStore.set('legacy_exp_1', {
      id: 'legacy_exp_1',
      userId: 'guest',
      title: 'Legacy Offline Expense',
      description: 'Recorded before login was implemented',
      amountPaise: 25000,
      categoryId: 'groceries',
      expenseDate: '2026-09-15',
      createdAt: '2026-09-15T10:00:00Z',
      updatedAt: '2026-09-15T10:00:00Z',
    });

    // Guest user can view legacy expense
    const guestExpenses = await repoGuest.getAll();
    expect(guestExpenses.length).toBe(1);
    expect(guestExpenses[0].title).toBe('Legacy Offline Expense');

    // Newly signed-in user does NOT see legacy expenses
    const newAccountRepo = new InMemoryPersonalExpenseRepository('uid_new_user_789', sharedStore);
    const newAccountExpenses = await newAccountRepo.getAll();
    expect(newAccountExpenses.length).toBe(0);
  });

  test('account switching simulation: signing out and switching accounts preserves data without leaks', async () => {
    // 1. User Alice creates expense while logged in
    await repoAlice.create({ title: 'Alice Personal Expense', amountPaise: 10000, categoryId: 'food', expenseDate: '2026-10-10' });

    // 2. User logs out -> App enters Guest mode
    const guestView = await repoGuest.getAll();
    expect(guestView.length).toBe(0);

    // 3. In guest mode, user adds an offline expense
    await repoGuest.create({ title: 'Guest Note', amountPaise: 2000, categoryId: 'other', expenseDate: '2026-10-10' });
    expect((await repoGuest.getAll()).length).toBe(1);

    // 4. User logs in as Bob -> sees only Bob's expenses (0 so far)
    expect((await repoBob.getAll()).length).toBe(0);
    await repoBob.create({ title: 'Bob Personal Expense', amountPaise: 40000, categoryId: 'rent', expenseDate: '2026-10-10' });
    expect((await repoBob.getAll()).length).toBe(1);

    // 5. User switches back to Alice -> Alice's expense is preserved and visible
    const aliceRestoredView = await repoAlice.getAll();
    expect(aliceRestoredView.length).toBe(1);
    expect(aliceRestoredView[0].title).toBe('Alice Personal Expense');

    // 6. User switches to Guest -> Guest expense is preserved
    const guestRestoredView = await repoGuest.getAll();
    expect(guestRestoredView.length).toBe(1);
    expect(guestRestoredView[0].title).toBe('Guest Note');
  });
});

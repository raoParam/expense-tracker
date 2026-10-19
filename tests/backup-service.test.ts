import {
  BackupService,
  BACKUP_SCHEMA_VERSION,
  BACKUP_DATA_TYPE,
  PersonalExpensesBackup,
} from '../src/services/backup-service';
import { InMemoryPersonalExpenseRepository } from '../src/repositories/personal-expense-repository';
import { PersonalExpense } from '../src/domain/types';

describe('BackupService Tests', () => {
  let sharedStore: Map<string, PersonalExpense>;
  let repoUser1: InMemoryPersonalExpenseRepository;
  let repoUser2: InMemoryPersonalExpenseRepository;
  let repoGuest: InMemoryPersonalExpenseRepository;

  beforeEach(() => {
    sharedStore = new Map();
    repoUser1 = new InMemoryPersonalExpenseRepository('user_1', sharedStore);
    repoUser2 = new InMemoryPersonalExpenseRepository('user_2', sharedStore);
    repoGuest = new InMemoryPersonalExpenseRepository('guest', sharedStore);
  });

  describe('Export Backup Generation', () => {
    it('should generate an empty backup structure when user has no expenses', async () => {
      const backup = await BackupService.generateBackup(repoUser1);

      expect(backup.version).toBe(BACKUP_SCHEMA_VERSION);
      expect(backup.dataType).toBe(BACKUP_DATA_TYPE);
      expect(backup.expenseCount).toBe(0);
      expect(backup.expenses).toEqual([]);
      expect(typeof backup.exportedAt).toBe('string');
    });

    it('should accurately export all personal expenses preserving integer paise and fields', async () => {
      await repoUser1.create({
        title: 'Books & Stationery',
        description: 'Semester textbooks',
        amountPaise: 125050, // ₹1250.50
        categoryId: 'academic',
        expenseDate: '2026-10-15',
      });

      await repoUser1.create({
        title: 'Mess Fee',
        description: 'Monthly meal charges',
        amountPaise: 400000, // ₹4000.00
        categoryId: 'food',
        expenseDate: '2026-10-18',
      });

      // Create an expense for User 2 that should NOT be in User 1's backup
      await repoUser2.create({
        title: 'Bob Gaming Subscription',
        amountPaise: 79900,
        categoryId: 'entertainment',
        expenseDate: '2026-10-17',
      });

      const backup = await BackupService.generateBackup(repoUser1);

      expect(backup.expenseCount).toBe(2);
      expect(backup.expenses.length).toBe(2);

      const books = backup.expenses.find((e) => e.title === 'Books & Stationery')!;
      expect(books).toBeDefined();
      expect(books.amountPaise).toBe(125050);
      expect(books.categoryId).toBe('academic');
      expect(books.expenseDate).toBe('2026-10-15');
      expect(books.description).toBe('Semester textbooks');

      // Verify User 2's expense is not in User 1's backup
      expect(backup.expenses.some((e) => e.title.includes('Bob'))).toBe(false);
    });

    it('should serialize backup to valid JSON', async () => {
      await repoUser1.create({
        title: 'Snacks',
        amountPaise: 5000,
        categoryId: 'food',
        expenseDate: '2026-10-19',
      });

      const backup = await BackupService.generateBackup(repoUser1);
      const serialized = BackupService.serializeBackup(backup);
      const parsed = JSON.parse(serialized);

      expect(parsed.dataType).toBe('personal_expenses');
      expect(parsed.expenses[0].amountPaise).toBe(5000);
    });
  });

  describe('Backup Validation', () => {
    const createValidBackup = (): PersonalExpensesBackup => ({
      version: 1,
      exportedAt: new Date().toISOString(),
      appVersion: '1.0.0',
      dataType: 'personal_expenses',
      expenseCount: 1,
      expenses: [
        {
          id: 'exp_valid_1',
          title: 'Hostel Rent',
          description: 'October rent',
          amountPaise: 650000,
          categoryId: 'rent',
          expenseDate: '2026-10-01',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });

    it('should validate a correctly formatted backup', () => {
      const valid = createValidBackup();
      const res = BackupService.validateBackup(valid);
      expect(res.valid).toBe(true);
      expect(res.data).toBeDefined();
    });

    it('should reject malformed JSON string', () => {
      const res = BackupService.parseAndValidateBackup('{ not valid json }');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Malformed JSON');
    });

    it('should reject empty or whitespace string', () => {
      const res = BackupService.parseAndValidateBackup('   ');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Empty file');
    });

    it('should reject non-object or array root', () => {
      expect(BackupService.validateBackup(null).valid).toBe(false);
      expect(BackupService.validateBackup([1, 2, 3]).valid).toBe(false);
      expect(BackupService.validateBackup('string').valid).toBe(false);
    });

    it('should reject invalid dataType', () => {
      const invalid = { ...createValidBackup(), dataType: 'shared_expenses' };
      const res = BackupService.validateBackup(invalid);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("dataType must be 'personal_expenses'");
    });

    it('should reject unsupported version numbers', () => {
      const v2 = { ...createValidBackup(), version: 2 };
      const resV2 = BackupService.validateBackup(v2);
      expect(resV2.valid).toBe(false);
      expect(resV2.error).toContain('Unsupported backup version: 2');

      const v0 = { ...createValidBackup(), version: 0 };
      const resV0 = BackupService.validateBackup(v0);
      expect(resV0.valid).toBe(false);
    });

    it('should reject expenses when not an array', () => {
      const invalid = { ...createValidBackup(), expenses: 'not-an-array' as any };
      const res = BackupService.validateBackup(invalid);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("'expenses' must be an array");
    });

    it('should reject invalid expense records with missing or empty ID', () => {
      const backup = createValidBackup();
      backup.expenses[0].id = '';
      const res = BackupService.validateBackup(backup);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("'id' must be a non-empty string");
    });

    it('should reject invalid expense records with missing or empty title', () => {
      const backup = createValidBackup();
      backup.expenses[0].title = '   ';
      const res = BackupService.validateBackup(backup);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("'title' must be a non-empty string");
    });

    it('should reject invalid amountPaise (negative, zero, decimal, or overflow)', () => {
      const backupNeg = createValidBackup();
      backupNeg.expenses[0].amountPaise = -100;
      expect(BackupService.validateBackup(backupNeg).valid).toBe(false);

      const backupZero = createValidBackup();
      backupZero.expenses[0].amountPaise = 0;
      expect(BackupService.validateBackup(backupZero).valid).toBe(false);

      const backupFloat = createValidBackup();
      backupFloat.expenses[0].amountPaise = 50.75;
      expect(BackupService.validateBackup(backupFloat).valid).toBe(false);

      const backupOverflow = createValidBackup();
      backupOverflow.expenses[0].amountPaise = 9999999999999;
      expect(BackupService.validateBackup(backupOverflow).valid).toBe(false);
    });

    it('should reject invalid date format', () => {
      const backup = createValidBackup();
      backup.expenses[0].expenseDate = '15/10/2026'; // Not YYYY-MM-DD
      const res = BackupService.validateBackup(backup);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('YYYY-MM-DD');
    });
  });

  describe('Import Preview & Duplicate Prevention', () => {
    it('should identify new expenses and duplicates against existing repository state', async () => {
      // Existing expense in User 1's repo
      await repoUser1.create({
        title: 'Electricity Bill',
        amountPaise: 80000,
        categoryId: 'utilities',
        expenseDate: '2026-10-10',
      });
      const allExisting = await repoUser1.getAll();
      const existingId = allExisting[0].id;

      const backup: PersonalExpensesBackup = {
        version: 1,
        exportedAt: new Date().toISOString(),
        appVersion: '1.0.0',
        dataType: 'personal_expenses',
        expenseCount: 3,
        expenses: [
          {
            id: existingId, // Duplicate of existing
            title: 'Electricity Bill',
            description: '',
            amountPaise: 80000,
            categoryId: 'utilities',
            expenseDate: '2026-10-10',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: 'exp_new_1',
            title: 'Water Can',
            description: '',
            amountPaise: 9000,
            categoryId: 'utilities',
            expenseDate: '2026-10-11',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: 'exp_new_2',
            title: 'Laundry',
            description: '',
            amountPaise: 15000,
            categoryId: 'personal',
            expenseDate: '2026-10-12',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      };

      const preview = await BackupService.previewImport(repoUser1, backup);

      expect(preview.totalInBackup).toBe(3);
      expect(preview.toImportCount).toBe(2);
      expect(preview.duplicateCount).toBe(1);
      expect(preview.duplicateIds).toContain(existingId);
      expect(preview.itemsToImport.map((i) => i.id)).toEqual(['exp_new_1', 'exp_new_2']);
    });

    it('should detect intra-backup duplicates and prevent inserting them twice', async () => {
      const backup: PersonalExpensesBackup = {
        version: 1,
        exportedAt: new Date().toISOString(),
        appVersion: '1.0.0',
        dataType: 'personal_expenses',
        expenseCount: 2,
        expenses: [
          {
            id: 'exp_repeat_1',
            title: 'Tea',
            description: '',
            amountPaise: 2000,
            categoryId: 'food',
            expenseDate: '2026-10-12',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: 'exp_repeat_1', // Same ID inside same file
            title: 'Tea Duplicate',
            description: '',
            amountPaise: 2000,
            categoryId: 'food',
            expenseDate: '2026-10-12',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      };

      const preview = await BackupService.previewImport(repoUser1, backup);
      expect(preview.totalInBackup).toBe(2);
      expect(preview.toImportCount).toBe(1);
      expect(preview.duplicateCount).toBe(1);
    });
  });

  describe('Import Execution & Round-Trip', () => {
    it('should complete a full export and re-import round trip', async () => {
      // 1. Create expenses in User 1
      await repoUser1.create({
        title: 'Groceries',
        description: 'Milk, Bread, Butter',
        amountPaise: 35000,
        categoryId: 'food',
        expenseDate: '2026-10-05',
      });
      await repoUser1.create({
        title: 'Metro Pass',
        description: 'Monthly pass',
        amountPaise: 90000,
        categoryId: 'travel',
        expenseDate: '2026-10-06',
      });

      // 2. Export backup
      const backup = await BackupService.generateBackup(repoUser1);
      const jsonStr = BackupService.serializeBackup(backup);

      // 3. Simulate new installation or clear state for User 1
      const freshStore = new Map<string, PersonalExpense>();
      const freshRepo = new InMemoryPersonalExpenseRepository('user_1', freshStore);

      // 4. Validate and preview import
      const validation = BackupService.parseAndValidateBackup(jsonStr);
      expect(validation.valid).toBe(true);

      const preview = await BackupService.previewImport(freshRepo, validation.data!);
      expect(preview.toImportCount).toBe(2);
      expect(preview.duplicateCount).toBe(0);

      // 5. Execute import
      const result = await BackupService.executeImport(freshRepo, preview);
      expect(result.importedCount).toBe(2);
      expect(result.skippedDuplicatesCount).toBe(0);

      // 6. Verify restored data
      const restored = await freshRepo.getAll();
      expect(restored.length).toBe(2);
      expect(restored.find((e) => e.title === 'Groceries')?.amountPaise).toBe(35000);
      expect(restored.find((e) => e.title === 'Metro Pass')?.amountPaise).toBe(90000);
    });

    it('should prevent duplicate insertion when re-importing the same backup twice', async () => {
      await repoUser1.create({
        title: 'Notebook',
        amountPaise: 8000,
        categoryId: 'academic',
        expenseDate: '2026-10-08',
      });

      const backup = await BackupService.generateBackup(repoUser1);

      // First import (already exists, so 1 duplicate)
      const preview1 = await BackupService.previewImport(repoUser1, backup);
      expect(preview1.toImportCount).toBe(0);
      expect(preview1.duplicateCount).toBe(1);

      const result1 = await BackupService.executeImport(repoUser1, preview1);
      expect(result1.importedCount).toBe(0);
      expect(result1.skippedDuplicatesCount).toBe(1);

      // Count remains exactly 1
      const count = (await repoUser1.getAll()).length;
      expect(count).toBe(1);
    });
  });

  describe('Account Isolation', () => {
    it('restores imported expenses strictly into the importing user’s scope', async () => {
      // User 1 creates an expense
      await repoUser1.create({
        title: 'User 1 Lunch',
        amountPaise: 25000,
        categoryId: 'food',
        expenseDate: '2026-10-10',
      });

      const backupUser1 = await BackupService.generateBackup(repoUser1);

      // User 2 imports this backup
      const previewUser2 = await BackupService.previewImport(repoUser2, backupUser1);
      expect(previewUser2.toImportCount).toBe(1);

      await BackupService.executeImport(repoUser2, previewUser2);

      // Verify User 2 now sees the imported expense under User 2's userId
      const user2Expenses = await repoUser2.getAll();
      expect(user2Expenses.length).toBe(1);
      expect(user2Expenses[0].title).toBe('User 1 Lunch');
      expect(user2Expenses[0].userId).toBe('user_2');

      // User 1 still has their own original expense intact
      const user1Expenses = await repoUser1.getAll();
      expect(user1Expenses.length).toBe(1);
      expect(user1Expenses[0].userId).toBe('user_1');
    });

    it('restores into guest scope when user is not signed in', async () => {
      const backup: PersonalExpensesBackup = {
        version: 1,
        exportedAt: new Date().toISOString(),
        appVersion: '1.0.0',
        dataType: 'personal_expenses',
        expenseCount: 1,
        expenses: [
          {
            id: 'exp_guest_import',
            title: 'Guest Offline Purchase',
            description: '',
            amountPaise: 12000,
            categoryId: 'other',
            expenseDate: '2026-10-15',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      };

      const preview = await BackupService.previewImport(repoGuest, backup);
      await BackupService.executeImport(repoGuest, preview);

      const guestExpenses = await repoGuest.getAll();
      expect(guestExpenses.length).toBe(1);
      expect(guestExpenses[0].userId).toBe('guest');

      // User 1 and User 2 cannot see guest expenses
      expect((await repoUser1.getAll()).length).toBe(0);
      expect((await repoUser2.getAll()).length).toBe(0);
    });
  });

  describe('Transactional Rollback on Failure', () => {
    it('rolls back all insertions if an error occurs mid-import, leaving existing records unchanged', async () => {
      // Existing expense in repo
      await repoUser1.create({
        title: 'Existing Expense',
        amountPaise: 10000,
        categoryId: 'food',
        expenseDate: '2026-10-01',
      });
      const initialCount = (await repoUser1.getAll()).length;
      expect(initialCount).toBe(1);

      // Mock repo.batchInsert to simulate a database crash or failure mid-transaction
      const spyBatch = jest.spyOn(repoUser1, 'batchInsert').mockRejectedValueOnce(
        new Error('Disk I/O error or constraint failure')
      );

      const backup: PersonalExpensesBackup = {
        version: 1,
        exportedAt: new Date().toISOString(),
        appVersion: '1.0.0',
        dataType: 'personal_expenses',
        expenseCount: 2,
        expenses: [
          {
            id: 'exp_fail_1',
            title: 'Failed 1',
            description: '',
            amountPaise: 20000,
            categoryId: 'food',
            expenseDate: '2026-10-02',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: 'exp_fail_2',
            title: 'Failed 2',
            description: '',
            amountPaise: 30000,
            categoryId: 'food',
            expenseDate: '2026-10-03',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      };

      const preview = await BackupService.previewImport(repoUser1, backup);

      await expect(BackupService.executeImport(repoUser1, preview)).rejects.toThrow(
        'Disk I/O error or constraint failure'
      );

      // Verify that after failed transaction, the repository state is preserved
      const afterFailure = await repoUser1.getAll();
      expect(afterFailure.length).toBe(1);
      expect(afterFailure[0].title).toBe('Existing Expense');

      spyBatch.mockRestore();
    });
  });
});

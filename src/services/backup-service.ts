import { Platform, Share } from 'react-native';
import { IPersonalExpenseRepository } from '../repositories/personal-expense-repository';
import { PersonalExpense } from '../domain/types';

export const BACKUP_SCHEMA_VERSION = 1;
export const BACKUP_DATA_TYPE = 'personal_expenses';
export const BACKUP_SCHEMA_URL = 'https://spendly.app/schemas/backup-v1.json';

export interface BackupExpenseItem {
  id: string;
  title: string;
  description: string;
  amountPaise: number;
  categoryId: string;
  expenseDate: string; // YYYY-MM-DD
  createdAt: string;   // ISO 8601
  updatedAt: string;   // ISO 8601
}

export interface PersonalExpensesBackup {
  $schema?: string;
  version: number;
  exportedAt: string;
  appVersion: string;
  dataType: 'personal_expenses';
  expenseCount: number;
  expenses: BackupExpenseItem[];
}

export interface BackupValidationResult {
  valid: boolean;
  error?: string;
  data?: PersonalExpensesBackup;
}

export interface ImportPreview {
  totalInBackup: number;
  toImportCount: number;
  duplicateCount: number;
  itemsToImport: BackupExpenseItem[];
  duplicateIds: string[];
}

export interface ImportResult {
  importedCount: number;
  skippedDuplicatesCount: number;
  totalInBackup: number;
}

export const BackupService = {
  /**
   * Generates a portable, validated backup structure from the personal expense repository
   */
  async generateBackup(repo: IPersonalExpenseRepository): Promise<PersonalExpensesBackup> {
    const expenses = await repo.getAll({ sortBy: 'expenseDate', sortOrder: 'ASC' });
    const backupExpenses: BackupExpenseItem[] = expenses.map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description || '',
      amountPaise: e.amountPaise,
      categoryId: e.categoryId,
      expenseDate: e.expenseDate,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }));

    return {
      $schema: BACKUP_SCHEMA_URL,
      version: BACKUP_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      appVersion: '1.0.0',
      dataType: BACKUP_DATA_TYPE,
      expenseCount: backupExpenses.length,
      expenses: backupExpenses,
    };
  },

  /**
   * Formats backup object as formatted JSON string
   */
  serializeBackup(backup: PersonalExpensesBackup): string {
    return JSON.stringify(backup, null, 2);
  },

  /**
   * Validates raw object structure, schema version, and all expense fields
   */
  validateBackup(raw: unknown): BackupValidationResult {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { valid: false, error: 'Malformed backup: Expected a valid JSON object.' };
    }

    const obj = raw as Record<string, any>;

    // 1. Check dataType
    if (obj.dataType !== BACKUP_DATA_TYPE) {
      return {
        valid: false,
        error: `Invalid backup file: dataType must be '${BACKUP_DATA_TYPE}'. Received '${obj.dataType || 'unknown'}'.`,
      };
    }

    // 2. Check schema version
    if (typeof obj.version !== 'number' || !Number.isInteger(obj.version) || obj.version < 1) {
      return {
        valid: false,
        error: 'Invalid backup version: Version must be a positive integer.',
      };
    }

    if (obj.version !== BACKUP_SCHEMA_VERSION) {
      return {
        valid: false,
        error: `Unsupported backup version: ${obj.version}. This version of Spendly supports backup schema version ${BACKUP_SCHEMA_VERSION}.`,
      };
    }

    // 3. Check expenses array
    if (!Array.isArray(obj.expenses)) {
      return { valid: false, error: "Malformed backup: 'expenses' must be an array." };
    }

    // 4. Validate each expense record
    for (let i = 0; i < obj.expenses.length; i++) {
      const item = obj.expenses[i];
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return { valid: false, error: `Invalid expense record at index ${i}: Expected an object.` };
      }

      // Validate ID
      if (typeof item.id !== 'string' || item.id.trim().length === 0) {
        return { valid: false, error: `Invalid expense record at index ${i}: 'id' must be a non-empty string.` };
      }

      // Validate Title
      if (typeof item.title !== 'string' || item.title.trim().length === 0) {
        return { valid: false, error: `Invalid expense record at index ${i}: 'title' must be a non-empty string.` };
      }
      if (item.title.trim().length > 100) {
        return { valid: false, error: `Invalid expense record at index ${i}: 'title' exceeds 100 characters.` };
      }

      // Validate amountPaise (positive integer <= 9,999,999,999 paise = ₹99,999,999.99)
      if (
        typeof item.amountPaise !== 'number' ||
        !Number.isInteger(item.amountPaise) ||
        item.amountPaise <= 0 ||
        item.amountPaise > 9999999999
      ) {
        return {
          valid: false,
          error: `Invalid expense record at index ${i}: 'amountPaise' must be an integer between 1 and 9,999,999,999.`,
        };
      }

      // Validate categoryId
      if (typeof item.categoryId !== 'string' || item.categoryId.trim().length === 0) {
        return { valid: false, error: `Invalid expense record at index ${i}: 'categoryId' must be a non-empty string.` };
      }

      // Validate expenseDate (YYYY-MM-DD format)
      if (
        typeof item.expenseDate !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(item.expenseDate) ||
        isNaN(Date.parse(item.expenseDate))
      ) {
        return {
          valid: false,
          error: `Invalid expense record at index ${i}: 'expenseDate' must be a valid date in YYYY-MM-DD format.`,
        };
      }

      // Validate createdAt
      if (typeof item.createdAt !== 'string' || isNaN(Date.parse(item.createdAt))) {
        return {
          valid: false,
          error: `Invalid expense record at index ${i}: 'createdAt' must be a valid ISO timestamp.`,
        };
      }

      // Validate updatedAt
      if (typeof item.updatedAt !== 'string' || isNaN(Date.parse(item.updatedAt))) {
        return {
          valid: false,
          error: `Invalid expense record at index ${i}: 'updatedAt' must be a valid ISO timestamp.`,
        };
      }
    }

    return {
      valid: true,
      data: obj as PersonalExpensesBackup,
    };
  },

  /**
   * Parses JSON string and validates content
   */
  parseAndValidateBackup(jsonString: string): BackupValidationResult {
    if (!jsonString || typeof jsonString !== 'string' || jsonString.trim().length === 0) {
      return { valid: false, error: 'Empty file: The selected backup file contains no data.' };
    }

    let parsed: any;
    try {
      parsed = JSON.parse(jsonString);
    } catch {
      return { valid: false, error: 'Malformed JSON: The backup file is corrupted or not valid JSON.' };
    }

    return this.validateBackup(parsed);
  },

  /**
   * Compares backup expenses with existing records to calculate new imports vs. duplicates
   */
  async previewImport(
    repo: IPersonalExpenseRepository,
    backup: PersonalExpensesBackup
  ): Promise<ImportPreview> {
    const existingIds = await repo.getExistingIds();
    const itemsToImport: BackupExpenseItem[] = [];
    const duplicateIds: string[] = [];
    const seenInBackup = new Set<string>();

    for (const item of backup.expenses) {
      if (existingIds.has(item.id) || seenInBackup.has(item.id)) {
        duplicateIds.push(item.id);
      } else {
        seenInBackup.add(item.id);
        itemsToImport.push(item);
      }
    }

    return {
      totalInBackup: backup.expenses.length,
      toImportCount: itemsToImport.length,
      duplicateCount: duplicateIds.length,
      itemsToImport,
      duplicateIds,
    };
  },

  /**
   * Executes atomic database restoration for previewed expenses into the repository user's scope
   */
  async executeImport(
    repo: IPersonalExpenseRepository,
    preview: ImportPreview
  ): Promise<ImportResult> {
    if (preview.toImportCount === 0) {
      return {
        importedCount: 0,
        skippedDuplicatesCount: preview.duplicateCount,
        totalInBackup: preview.totalInBackup,
      };
    }

    const expensesToInsert: PersonalExpense[] = preview.itemsToImport.map((item) => ({
      id: item.id,
      userId: '', // repo.batchInsert will assign repository scope
      title: item.title.trim(),
      description: (item.description || '').trim(),
      amountPaise: item.amountPaise,
      categoryId: item.categoryId.trim(),
      expenseDate: item.expenseDate,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));

    const insertedCount = await repo.batchInsert(expensesToInsert);

    return {
      importedCount: insertedCount,
      skippedDuplicatesCount: preview.duplicateCount,
      totalInBackup: preview.totalInBackup,
    };
  },

  /**
   * Exports backup to a file or share sheet depending on platform
   */
  async exportBackup(
    repo: IPersonalExpenseRepository
  ): Promise<{
    success: boolean;
    count: number;
    filename: string;
    cancelled?: boolean;
    error?: string;
  }> {
    try {
      const backup = await this.generateBackup(repo);
      const jsonStr = this.serializeBackup(backup);
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `spendly-personal-backup-${dateStr}.json`;

      // Web platform export via browser download
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        try {
          const blob = new Blob([jsonStr], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          return { success: true, count: backup.expenseCount, filename };
        } catch (webErr: any) {
          return { success: false, count: backup.expenseCount, filename, error: webErr?.message };
        }
      }

      // Android Storage Access Framework check for direct file creation
      if (Platform.OS === 'android') {
        try {
          const { StorageAccessFramework } = await import('expo-file-system/legacy');
          const permissions = await StorageAccessFramework.requestDirectoryPermissionsAsync();
          if (permissions.granted) {
            const fileUri = await StorageAccessFramework.createFileAsync(
              permissions.directoryUri,
              filename,
              'application/json'
            );
            await StorageAccessFramework.writeAsStringAsync(fileUri, jsonStr);
            return { success: true, count: backup.expenseCount, filename };
          }
        } catch (safErr: any) {
          console.warn('[BackupService] StorageAccessFramework export skipped or unavailable:', safErr?.message);
          // Fall through to system share sheet
        }
      }

      // Native fallback: Share sheet (saves to Drive, Notes, Files, messaging, or clipboard)
      const shareResult = await Share.share({
        title: filename,
        message: jsonStr,
      });

      if (shareResult.action === Share.dismissedAction) {
        return { success: false, count: backup.expenseCount, filename, cancelled: true };
      }

      return { success: true, count: backup.expenseCount, filename };
    } catch (err: any) {
      return {
        success: false,
        count: 0,
        filename: '',
        error: err?.message || 'Failed to export backup.',
      };
    }
  },

  /**
   * Opens file picker on native or web to select and read backup file contents
   */
  async importBackupFromFile(): Promise<{
    cancelled: boolean;
    content?: string;
    error?: string;
  }> {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.onchange = (e: any) => {
          const file = e.target?.files?.[0];
          if (!file) {
            resolve({ cancelled: true });
            return;
          }
          const reader = new FileReader();
          reader.onload = () => {
            resolve({ cancelled: false, content: reader.result as string });
          };
          reader.onerror = () => {
            resolve({ cancelled: false, error: 'Failed to read selected file.' });
          };
          reader.readAsText(file);
        };
        input.click();
      });
    }

    try {
      const { File } = await import('expo-file-system');
      const pickResult = await File.pickFileAsync({
        mimeTypes: ['application/json', 'text/*', '*/*'],
      });

      if (pickResult.canceled || !pickResult.result) {
        return { cancelled: true };
      }

      const file = Array.isArray(pickResult.result) ? pickResult.result[0] : pickResult.result;
      const content = await file.text();
      return { cancelled: false, content };
    } catch (err: any) {
      return {
        cancelled: false,
        error: err?.message || 'Failed to open file picker.',
      };
    }
  },
};

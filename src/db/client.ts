import type { SQLiteDatabase } from 'expo-sqlite';
import {
  CREATE_MIGRATIONS_TABLE,
  CURRENT_SCHEMA_VERSION,
  MIGRATION_V1,
  MIGRATION_V2,
} from './schema';

export async function migrateDbIfNeeded(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(CREATE_MIGRATIONS_TABLE);

  const result = await db.getFirstAsync<{ version: number }>(
    'SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1'
  );

  const currentVersion = result?.version ?? 0;

  if (currentVersion < 1) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATION_V1);
      await db.runAsync(
        'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)',
        1,
        new Date().toISOString()
      );
    });
  }

  if (currentVersion < 2) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATION_V2);
      await db.runAsync(
        'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)',
        2,
        new Date().toISOString()
      );
    });
  }
}

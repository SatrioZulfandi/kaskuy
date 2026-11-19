import { getDatabase, withDatabaseTransaction } from '../database';

export type ThemePreference = 'system' | 'light' | 'dark';

export async function getAppPreferences(): Promise<{ theme: ThemePreference; onboardingCompleted: boolean }> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM app_settings');
  const values = new Map(rows.map((row) => [row.key, row.value]));
  const theme = values.get('theme');
  return {
    theme: theme === 'light' || theme === 'dark' ? theme : 'system',
    onboardingCompleted: values.get('onboarding_completed') === '1',
  };
}

export async function setAppPreference(key: 'theme' | 'onboarding_completed', value: string): Promise<void> {
  if (key === 'theme' && !['system', 'light', 'dark'].includes(value)) throw new Error('Pilihan tema tidak valid.');
  if (key === 'onboarding_completed' && !['0', '1'].includes(value)) throw new Error('Pilihan panduan tidak valid.');
  await withDatabaseTransaction(async (db) => {
    await db.runAsync('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);
  });
}

import * as SQLite from 'expo-sqlite';

export type MedPulseSqliteDb = SQLite.SQLiteDatabase;

export async function openMedPulseSqliteDb(): Promise<MedPulseSqliteDb | null> {
  return SQLite.openDatabaseAsync('medpulse_offline.db');
}

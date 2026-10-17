/**
 * e2eBackupMarker — a file the sealed E2E build writes once, where Android's backup takes it (the
 * app's own files), for the backup-and-restore run (.maestro/lifecycle/backup_restore.yaml,
 * WORKLIST P0.86): after the backup, the uninstall and the restore, the marker must be back before
 * the app opens again, or the backup never happened and the run proves nothing (e2e/fault-proxy.mjs
 * says so). Whether it was written is traced; every other build writes nothing.
 */
import * as FileSystem from 'expo-file-system/legacy';
import { E2E_BUILD, e2eTrace } from './e2eTrace';

/** The marker's name in the app's own files (/data/data/<the app>/files/ on Android). */
export const BACKUP_MARKER = 'e2e-backup-marker';

let asked = false;

/** Writes the marker unless it is there already; once a launch, in the E2E build alone. */
export async function writeBackupMarkerOnce(): Promise<void> {
  if (!E2E_BUILD || asked) return;
  asked = true;
  const path = `${FileSystem.documentDirectory}${BACKUP_MARKER}`;
  try {
    const there = (await FileSystem.getInfoAsync(path)).exists;
    if (!there) await FileSystem.writeAsStringAsync(path, 'The house remembers its own.');
    e2eTrace('backup.marker', { there, written: !there });
  } catch (e) {
    e2eTrace('backup.marker', { written: false, why: e instanceof Error ? e.message : String(e) });
  }
}

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

/**
 * Migrate user data from ~/.brilliantcode to ~/.cheri
 * Run once on first app launch after rebranding
 */
export async function migrateUserData(): Promise<{ migrated: boolean; error?: string }> {
  const homeDir = os.homedir();
  if (!homeDir) {
    return { migrated: false, error: 'Could not determine home directory' };
  }

  const oldPath = path.join(homeDir, '.brilliantcode');
  const newPath = path.join(homeDir, '.cheri');

  try {
    // Check if old path exists
    const oldExists = fs.existsSync(oldPath);
    if (!oldExists) {
      // No migration needed
      return { migrated: false };
    }

    // Check if new path already exists
    const newExists = fs.existsSync(newPath);
    if (newExists) {
      // Already migrated or new path exists, don't overwrite
      console.log('[Migration] .cheri directory already exists, skipping migration');
      return { migrated: false };
    }

    // Perform migration by renaming directory
    console.log(`[Migration] Migrating user data from ${oldPath} to ${newPath}...`);
    fs.renameSync(oldPath, newPath);
    console.log('[Migration] Migration complete!');

    return { migrated: true };
  } catch (error: any) {
    const errorMsg = `Failed to migrate user data: ${error?.message || error}`;
    console.error('[Migration]', errorMsg);
    return { migrated: false, error: errorMsg };
  }
}

/**
 * Get the user data directory path (after potential migration)
 */
export function getUserDataPath(): string {
  const homeDir = os.homedir();
  return path.join(homeDir, '.cheri');
}

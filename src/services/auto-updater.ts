/**
 * Auto-updater service for BrilliantCode
 * 
 * Uses electron-updater to check for, download, and install updates
 * from the CloudFront-backed S3 releases bucket.
 * 
 * Update flow:
 * 1. App checks for updates on startup and periodically
 * 2. If update available, user is notified
 * 3. User clicks "Download Update" - download happens in background
 * 4. When download complete, user clicks "Restart to Update"
 * 5. App quits and installs the update, then restarts
 */

import type { UpdateInfo, ProgressInfo, UpdateCheckResult } from 'electron-updater';
import { app, ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type UpdateStatus = 
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface UpdateStatusPayload {
  status: UpdateStatus;
  info?: UpdateInfo;
  progress?: ProgressInfo;
  error?: string;
  currentVersion?: string;
  latestVersion?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const UPDATE_FEED_URL = (process.env.BRILLIANTCODE_UPDATE_FEED_URL || '').trim();

let cachedAutoUpdater: any | null = null;

function getAutoUpdater(): any | null {
  if (cachedAutoUpdater) return cachedAutoUpdater;
  if (!UPDATE_FEED_URL) return null;
  if (!process.versions || !process.versions.electron) return null;
  try {
    const mod = require('electron-updater');
    const pkg: any = mod?.default ?? mod;
    const updater = pkg?.autoUpdater ?? null;
    if (!updater) return null;
    cachedAutoUpdater = updater;
    return updater;
  } catch (error: any) {
    log.warn('Failed to load electron-updater:', error?.message || error);
    return null;
  }
}

function configureAutoUpdaterDefaults(updater: any): void {
  try {
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = true;
    updater.allowPrerelease = false;
    updater.allowDowngrade = false;

    // Assign custom logger to autoUpdater
    updater.logger = log as any;

    // Enable update checks in development mode (for testing)
    if (process.env.NODE_ENV !== 'production' || !app.isPackaged) {
      updater.forceDevUpdateConfig = true;
      const devVersion = resolveDevPackageVersion();
      if (devVersion) {
        updater.currentVersion = devVersion;
        log.info('Dev mode: Set current version to', devVersion);
      } else {
        log.warn('Dev mode: Falling back to Electron version', app.getVersion());
      }
      log.info('Dev mode: Force update config enabled for testing');
    }
  } catch (error: any) {
    log.warn('Failed to configure autoUpdater defaults:', error?.message || error);
  }
}

// Configure logging
const log = {
  info: (...args: any[]) => console.log('[auto-updater]', ...args),
  warn: (...args: any[]) => console.warn('[auto-updater]', ...args),
  error: (...args: any[]) => console.error('[auto-updater]', ...args),
  debug: (...args: any[]) => console.log('[auto-updater:debug]', ...args),
};

function configureUpdateFeed(): void {
  try {
    if (!UPDATE_FEED_URL) {
      log.info('Auto-updater disabled (no BRILLIANTCODE_UPDATE_FEED_URL configured).');
      return;
    }
    const autoUpdater = getAutoUpdater();
    if (!autoUpdater) {
      log.warn('Auto-updater unavailable in this runtime.');
      return;
    }
    configureAutoUpdaterDefaults(autoUpdater);
    if (typeof autoUpdater.setFeedURL === 'function') {
      autoUpdater.setFeedURL({ provider: 'generic', url: UPDATE_FEED_URL } as any);
      log.info('Auto-updater feed configured:', UPDATE_FEED_URL);
    } else {
      log.warn('autoUpdater.setFeedURL is not available; relying on embedded config');
    }
  } catch (error: any) {
    log.error('Failed to configure auto-update feed:', error?.message || error);
  }
}

//
// Version helpers
//

let devPackageVersion: string | null = null;
let attemptedDevVersionResolution = false;

function findNearestPackageJson(startDir: string): string | null {
  let currentDir = path.resolve(startDir);
  const visited = new Set<string>();

  while (!visited.has(currentDir)) {
    const candidate = path.join(currentDir, 'package.json');
    if (fs.existsSync(candidate)) {
      return candidate;
    }

    visited.add(currentDir);
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  return null;
}

function resolveDevPackageVersion(): string | null {
  if (app.isPackaged) return null;
  if (devPackageVersion) return devPackageVersion;
  if (attemptedDevVersionResolution) return null;

  attemptedDevVersionResolution = true;
  const searchRoots = [app.getAppPath(), process.cwd()];

  for (const root of searchRoots) {
    const packageJsonPath = findNearestPackageJson(root);
    if (!packageJsonPath) continue;

    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      if (typeof packageJson.version === 'string' && packageJson.version.trim()) {
        devPackageVersion = packageJson.version.trim();
        log.debug('Dev mode: Resolved package version from', packageJsonPath);
        return devPackageVersion;
      }
      log.warn('Dev mode: package.json is missing a version field at', packageJsonPath);
    } catch (error: any) {
      log.warn('Dev mode: Failed to read package.json version at', packageJsonPath, error.message ?? error);
    }
  }

  log.warn('Dev mode: Could not locate package.json for version resolution');
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;
let currentStatus: UpdateStatus = 'idle';
let lastUpdateInfo: UpdateInfo | null = null;
let lastError: string | null = null;
let isInitialized = false;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function sendStatusToRenderer(payload: UpdateStatusPayload): void {
  log.info('Sending status to renderer:', payload.status);
  currentStatus = payload.status;
  
  if (payload.info) {
    lastUpdateInfo = payload.info;
  }
  if (payload.error) {
    lastError = payload.error;
  }
  
  try {
    mainWindow?.webContents?.send('auto-update:status', payload);
  } catch (err) {
    log.error('Failed to send status to renderer:', err);
  }
}

/**
 * Get the current app version.
 * In production the Electron runtime already reports the app version.
 * In development we resolve it from package.json.
 */
function getCurrentVersion(): string {
  if (app.isPackaged) {
    return app.getVersion();
  }

  return resolveDevPackageVersion() ?? app.getVersion();
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-updater Event Handlers
// ─────────────────────────────────────────────────────────────────────────────

function setupAutoUpdaterEvents(): void {
  const autoUpdater = getAutoUpdater();
  if (!autoUpdater) return;
  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for update...');
    sendStatusToRenderer({
      status: 'checking',
      currentVersion: getCurrentVersion(),
    });
  });

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    log.info('Update available:', info.version);
    sendStatusToRenderer({
      status: 'available',
      info,
      currentVersion: getCurrentVersion(),
      latestVersion: info.version,
    });
  });

  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    log.info('No update available. Current version is latest:', info.version);
    sendStatusToRenderer({
      status: 'not-available',
      info,
      currentVersion: getCurrentVersion(),
      latestVersion: info.version,
    });
  });

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    const percent = Math.round(progress.percent);
    log.info(`Download progress: ${percent}% (${formatBytes(progress.transferred)}/${formatBytes(progress.total)})`);
    sendStatusToRenderer({
      status: 'downloading',
      progress,
      currentVersion: getCurrentVersion(),
      latestVersion: lastUpdateInfo?.version,
    });
  });

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    log.info('Update downloaded:', info.version);
    sendStatusToRenderer({
      status: 'downloaded',
      info,
      currentVersion: getCurrentVersion(),
      latestVersion: info.version,
    });
  });

  autoUpdater.on('error', (error: Error) => {
    log.error('Auto-updater error:', error.message);
    sendStatusToRenderer({
      status: 'error',
      error: error.message,
      currentVersion: getCurrentVersion(),
    });
  });
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// ─────────────────────────────────────────────────────────────────────────────
// IPC Handlers
// ─────────────────────────────────────────────────────────────────────────────

function setupIpcHandlers(): void {
  // Check for updates
  ipcMain.handle('auto-update:check', async () => {
    log.info('IPC: check for updates requested');
    const updater = getAutoUpdater();
    if (!updater) {
      return { ok: false, error: 'Auto-updater is disabled.', currentVersion: getCurrentVersion() };
    }
    try {
      const result = await updater.checkForUpdates();
      return {
        ok: true,
        updateAvailable: result?.updateInfo ? 
          isNewerVersion(result.updateInfo.version, getCurrentVersion()) : false,
        currentVersion: getCurrentVersion(),
        latestVersion: result?.updateInfo?.version,
        updateInfo: result?.updateInfo,
      };
    } catch (error: any) {
      log.error('Failed to check for updates:', error.message);
      return {
        ok: false,
        error: error.message,
        currentVersion: getCurrentVersion(),
      };
    }
  });

  // Download update
  ipcMain.handle('auto-update:download', async () => {
    log.info('IPC: download update requested');
    const updater = getAutoUpdater();
    if (!updater) {
      return { ok: false, error: 'Auto-updater is disabled.' };
    }
    try {
      await updater.downloadUpdate();
      return { ok: true };
    } catch (error: any) {
      log.error('Failed to download update:', error.message);
      return { ok: false, error: error.message };
    }
  });

  // Install update (quit and install)
  ipcMain.handle('auto-update:install', () => {
    log.info('IPC: install update requested - quitting and installing');
    const updater = getAutoUpdater();
    if (!updater) {
      return { ok: false, error: 'Auto-updater is disabled.' };
    }
    // Give a small delay to allow the renderer to show any final UI
    setTimeout(() => {
      updater.quitAndInstall(false, true);
    }, 100);
    return { ok: true };
  });

  // Get current status
  ipcMain.handle('auto-update:status', () => {
    return {
      ok: true,
      status: currentStatus,
      currentVersion: getCurrentVersion(),
      latestVersion: lastUpdateInfo?.version,
      error: lastError,
    };
  });

  // Get current app version
  ipcMain.handle('auto-update:version', () => {
    return {
      ok: true,
      version: getCurrentVersion(),
    };
  });
}

/**
 * Compare two semantic version strings.
 * Returns true if v1 > v2 (v1 is newer)
 */
function isNewerVersion(v1: string, v2: string): boolean {
  const normalize = (v: string): number[] => {
    return v.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  };
  const parts1 = normalize(v1);
  const parts2 = normalize(v2);
  const maxLen = Math.max(parts1.length, parts2.length);
  
  for (let i = 0; i < maxLen; i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return true;
    if (p1 < p2) return false;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Initialize the auto-updater with the main window reference.
 * Should be called once after the main window is created.
 */
export function setupAutoUpdater(win: BrowserWindow): void {
  if (isInitialized) {
    log.warn('Auto-updater already initialized');
    mainWindow = win;
    return;
  }

  log.info('Initializing auto-updater...');
  log.info('App version:', getCurrentVersion());
  log.info('Update feed:', UPDATE_FEED_URL);

  mainWindow = win;

  configureUpdateFeed();
  setupIpcHandlers();

  if (!UPDATE_FEED_URL) {
    isInitialized = true;
    log.info('Auto-updater initialized in disabled mode');
    return;
  }

  const autoUpdater = getAutoUpdater();
  if (!autoUpdater) {
    isInitialized = true;
    log.info('Auto-updater initialized but unavailable in this runtime');
    return;
  }

  setupAutoUpdaterEvents();

  isInitialized = true;
  log.info('Auto-updater initialized successfully');
}

/**
 * Check for updates programmatically.
 * Usually called on app startup after a delay.
 */
export async function checkForUpdates(): Promise<UpdateCheckResult | null> {
  if (!UPDATE_FEED_URL) {
    log.warn('Auto-updater is disabled; skipping update check.');
    return null;
  }
  const autoUpdater = getAutoUpdater();
  if (!autoUpdater) {
    log.warn('Auto-updater unavailable; skipping update check.');
    return null;
  }
  log.info('Checking for updates...');
  try {
    return await autoUpdater.checkForUpdates();
  } catch (error: any) {
    log.error('Error checking for updates:', error.message);
    return null;
  }
}

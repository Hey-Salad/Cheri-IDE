// ─────────────────────────────────────────────────────────────────────────────
// Auto-update check and notification using electron-updater
// ─────────────────────────────────────────────────────────────────────────────

const UPDATE_BANNER_DISMISSED_KEY = 'bc.update.dismissed';
const UPDATE_BANNER_SNOOZE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const INITIAL_CHECK_DELAY_MS = 5000; // 5 seconds after app starts

type UpdateStatus = 
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

interface UpdateStatusPayload {
  status: UpdateStatus;
  info?: {
    version?: string;
    releaseDate?: string;
    releaseNotes?: string;
  };
  progress?: {
    percent: number;
    bytesPerSecond: number;
    transferred: number;
    total: number;
  };
  error?: string;
  currentVersion?: string;
  latestVersion?: string;
}

let updateBannerEl: HTMLElement | null = null;
let currentUpdateStatus: UpdateStatus = 'idle';
let latestVersionInfo: { version: string; currentVersion: string } | null = null;

type SuppressionType = 'snooze' | 'dismiss';

interface SuppressionState {
  version: string;
  type: SuppressionType;
  timestamp: number;
}

function setLatestVersionInfo(info: { currentVersion: string; latestVersion: string }): void {
  latestVersionInfo = {
    version: info.latestVersion,
    currentVersion: info.currentVersion,
  };
}
let statusListenerCleanup: (() => void) | null = null;

function readSuppressionState(): SuppressionState | null {
  try {
    const raw = localStorage.getItem(UPDATE_BANNER_DISMISSED_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.version === 'string' &&
      parsed.version.trim()
    ) {
      return {
        version: String(parsed.version).trim(),
        type: parsed.type === 'dismiss' ? 'dismiss' : 'snooze',
        timestamp: typeof parsed.timestamp === 'number' ? parsed.timestamp : Date.now(),
      };
    }
  } catch {
    // Ignore malformed data – we'll clear it below
  }
  try {
    localStorage.removeItem(UPDATE_BANNER_DISMISSED_KEY);
  } catch {}
  return null;
}

function saveSuppressionState(version: string, type: SuppressionType): void {
  try {
    const payload: SuppressionState = {
      version,
      type,
      timestamp: Date.now(),
    };
    localStorage.setItem(UPDATE_BANNER_DISMISSED_KEY, JSON.stringify(payload));
  } catch {}
}

function clearSuppressionState(): void {
  try {
    localStorage.removeItem(UPDATE_BANNER_DISMISSED_KEY);
  } catch {}
}

function getActiveSuppression(version: string): SuppressionType | null {
  const state = readSuppressionState();
  if (!state) return null;
  if (state.version !== version) {
    clearSuppressionState();
    return null;
  }

  if (state.type === 'dismiss') {
    return 'dismiss';
  }

  if (Date.now() - state.timestamp < UPDATE_BANNER_SNOOZE_TTL_MS) {
    return 'snooze';
  }

  clearSuppressionState();
  return null;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function createUpdateBanner(info: { currentVersion: string; latestVersion: string }): HTMLElement {
  const banner = document.createElement('div');
  banner.id = 'update-banner';
  banner.className = 'update-banner';
  banner.setAttribute('role', 'alert');
  
  const downloadIconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
    <polyline points="7,10 12,15 17,10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>`;
  
  // Add styles if not already present
  if (!document.getElementById('update-banner-styles')) {
    const style = document.createElement('style');
    style.id = 'update-banner-styles';
    style.textContent = `
      .update-banner {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 10000;
        background: linear-gradient(135deg, #1e3a5f 0%, #0d1f33 100%);
        border-bottom: 1px solid rgba(59, 130, 246, 0.3);
        padding: 12px 16px;
        animation: updateSlideDown 0.3s ease-out;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
      }
      @keyframes updateSlideDown {
        from { transform: translateY(-100%); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      .update-banner.hiding {
        animation: updateSlideUp 0.2s ease-in forwards;
      }
      @keyframes updateSlideUp {
        from { transform: translateY(0); opacity: 1; }
        to { transform: translateY(-100%); opacity: 0; }
      }
      .update-banner-content {
        display: flex;
        align-items: center;
        gap: 12px;
        max-width: 1200px;
        margin: 0 auto;
      }
      .update-banner-icon {
        flex-shrink: 0;
        color: #60a5fa;
      }
      .update-banner-icon.success {
        color: #34d399;
      }
      .update-banner-text {
        flex: 1;
        font-size: 13px;
        color: #e5e7eb;
      }
      .update-banner-text strong {
        color: #fff;
        margin-right: 8px;
      }
      .update-banner-progress {
        margin-top: 6px;
      }
      .update-progress-bar {
        width: 100%;
        max-width: 300px;
        height: 4px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 2px;
        overflow: hidden;
      }
      .update-progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #3b82f6, #60a5fa);
        transition: width 0.2s ease-out;
        border-radius: 2px;
      }
      .update-progress-text {
        font-size: 11px;
        color: #9ca3af;
        margin-top: 4px;
      }
      .update-banner-actions {
        flex-shrink: 0;
        display: flex;
        gap: 8px;
        align-items: center;
      }
      .update-banner-btn {
        padding: 6px 14px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s ease;
        border: none;
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .update-banner-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
      .update-btn-primary {
        background: #3b82f6;
        color: #fff;
      }
      .update-btn-primary:hover:not(:disabled) {
        background: #2563eb;
      }
      .update-btn-success {
        background: #10b981;
        color: #fff;
      }
      .update-btn-success:hover:not(:disabled) {
        background: #059669;
      }
      .update-btn-success svg {
        width: 14px;
        height: 14px;
      }
      .update-btn-dismiss {
        background: transparent;
        color: #9ca3af;
        border: 1px solid rgba(156, 163, 175, 0.3);
      }
      .update-btn-dismiss:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.05);
        color: #e5e7eb;
      }
      body.has-update-banner {
        padding-top: 56px !important;
      }
      body.has-update-banner .title-bar {
        top: 56px;
      }
      body.has-update-banner.update-downloading {
        padding-top: 76px !important;
      }
      body.has-update-banner.update-downloading .title-bar {
        top: 76px;
      }
    `;
    document.head.appendChild(style);
  }
  
  banner.innerHTML = `
    <div class="update-banner-content">
      <div class="update-banner-icon" id="update-icon">${downloadIconSvg}</div>
      <div class="update-banner-text">
        <div id="update-message">
          <strong>Update available!</strong>
          <span>Version ${escapeHtml(info.latestVersion)} is now available (you have ${escapeHtml(info.currentVersion)})</span>
        </div>
        <div class="update-banner-progress" id="update-progress" style="display: none;">
          <div class="update-progress-bar">
            <div class="update-progress-fill" id="update-progress-fill" style="width: 0%"></div>
          </div>
          <div class="update-progress-text" id="update-progress-text">Preparing download...</div>
        </div>
      </div>
      <div class="update-banner-actions" id="update-actions">
        <button class="update-banner-btn update-btn-primary" data-action="install">
          Install Update
        </button>
        <button class="update-banner-btn update-btn-primary" data-action="remind">
          Remind Me Later
        </button>
        <button class="update-banner-btn update-btn-dismiss" data-action="dismiss">
          Dismiss
        </button>
      </div>
    </div>
  `;
  
  return banner;
}

function updateBannerUI(status: UpdateStatus, payload?: UpdateStatusPayload): void {
  if (!updateBannerEl) return;
  
  const iconEl = updateBannerEl.querySelector('#update-icon') as HTMLElement;
  const messageEl = updateBannerEl.querySelector('#update-message') as HTMLElement;
  const progressEl = updateBannerEl.querySelector('#update-progress') as HTMLElement;
  const progressFill = updateBannerEl.querySelector('#update-progress-fill') as HTMLElement;
  const progressText = updateBannerEl.querySelector('#update-progress-text') as HTMLElement;
  const actionsEl = updateBannerEl.querySelector('#update-actions') as HTMLElement;
  
  const downloadIconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
    <polyline points="7,10 12,15 17,10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>`;
  
  const checkIconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <polyline points="20,6 9,17 4,12"/>
  </svg>`;
  
  const refreshIconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <polyline points="23,4 23,10 17,10"/>
    <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
  </svg>`;
  
  switch (status) {
    case 'downloading':
      document.body.classList.add('update-downloading');
      if (iconEl) iconEl.innerHTML = downloadIconSvg;
      if (messageEl) {
        messageEl.innerHTML = `<strong>Downloading update...</strong>`;
      }
      if (progressEl) progressEl.style.display = 'block';
      if (payload?.progress) {
        const percent = Math.round(payload.progress.percent);
        if (progressFill) progressFill.style.width = `${percent}%`;
        if (progressText) {
          const transferred = formatBytes(payload.progress.transferred);
          const total = formatBytes(payload.progress.total);
          const speed = formatBytes(payload.progress.bytesPerSecond);
          progressText.textContent = `${percent}% • ${transferred} / ${total} • ${speed}/s`;
        }
      }
      if (actionsEl) {
        actionsEl.innerHTML = `
          <button class="update-banner-btn update-btn-dismiss" disabled>
            Downloading...
          </button>
        `;
      }
      break;
      
    case 'downloaded':
      document.body.classList.remove('update-downloading');
      if (iconEl) {
        iconEl.innerHTML = checkIconSvg;
        iconEl.classList.add('success');
      }
      if (messageEl) {
        messageEl.innerHTML = `<strong>Update ready!</strong> <span>Restart to complete the update to version ${escapeHtml(payload?.latestVersion || latestVersionInfo?.version || 'latest')}</span>`;
      }
      if (progressEl) progressEl.style.display = 'none';
      if (actionsEl) {
        actionsEl.innerHTML = `
          <button class="update-banner-btn update-btn-success" data-action="install">
            ${refreshIconSvg} Restart Now
          </button>
          <button class="update-banner-btn update-btn-primary" data-action="remind">
            Remind Me Later
          </button>
          <button class="update-banner-btn update-btn-dismiss" data-action="dismiss">
            Dismiss
          </button>
        `;
      }
      break;
      
    case 'error':
      document.body.classList.remove('update-downloading');
      if (progressEl) progressEl.style.display = 'none';
      if (messageEl) {
        const errorMsg = payload?.error || 'Update check failed';
        messageEl.innerHTML = `<strong>Update error</strong> <span>${escapeHtml(errorMsg)}</span>`;
      }
      if (actionsEl) {
        actionsEl.innerHTML = `
          <button class="update-banner-btn update-btn-primary" data-action="retry">
            Retry
          </button>
          <button class="update-banner-btn update-btn-primary" data-action="remind">
            Remind Me Later
          </button>
          <button class="update-banner-btn update-btn-dismiss" data-action="dismiss">
            Dismiss
          </button>
        `;
      }
      break;
      
    case 'available':
    default:
      document.body.classList.remove('update-downloading');
      if (iconEl) {
        iconEl.innerHTML = downloadIconSvg;
        iconEl.classList.remove('success');
      }
      if (progressEl) progressEl.style.display = 'none';
      if (actionsEl && !actionsEl.querySelector('[data-action="install"]')) {
        // Reset to initial state if needed
        actionsEl.innerHTML = `
          <button class="update-banner-btn update-btn-primary" data-action="install">
            Install Update
          </button>
          <button class="update-banner-btn update-btn-primary" data-action="remind">
            Remind Me Later
          </button>
          <button class="update-banner-btn update-btn-dismiss" data-action="dismiss">
            Dismiss
          </button>
        `;
      }
      break;
  }
}

async function handleInstallUpdateRequest(): Promise<void> {
  if (currentUpdateStatus === 'downloaded') {
    await handleInstall();
    return;
  }

  console.log('[update-ui] Starting download...');
  try {
    currentUpdateStatus = 'downloading';
    updateBannerUI('downloading');
    
    const result = await window.autoUpdate?.download();
    if (!result?.ok) {
      console.error('[update-ui] Download failed:', result?.error);
      currentUpdateStatus = 'error';
      updateBannerUI('error', { status: 'error', error: result?.error || 'Download failed' });
    }
    // Success will be handled by the status event listener
  } catch (error) {
    console.error('[update-ui] Download error:', error);
    currentUpdateStatus = 'error';
    updateBannerUI('error', { status: 'error', error: String(error) });
  }
}

async function handleInstall(): Promise<void> {
  console.log('[update-ui] Installing update...');
  try {
    await window.autoUpdate?.install();
    // App will quit and restart, so no need to handle anything else
  } catch (error) {
    console.error('[update-ui] Install error:', error);
  }
}

function handleDismiss(): void {
  if (latestVersionInfo?.version) {
    saveSuppressionState(latestVersionInfo.version, 'dismiss');
  }
  hideUpdateBanner();
}

function handleRemindLater(): void {
  if (latestVersionInfo?.version) {
    saveSuppressionState(latestVersionInfo.version, 'snooze');
  }
  hideUpdateBanner();
}

function showUpdateBanner(
  info: { currentVersion: string; latestVersion: string },
  options?: { force?: boolean }
): void {
  if (updateBannerEl) return; // Already showing
  
  if (!options?.force) {
    const suppression = getActiveSuppression(info.latestVersion);
    if (suppression === 'dismiss') {
      console.log('[update-ui] Version', info.latestVersion, 'was dismissed by the user; not showing again.');
      return;
    }
    if (suppression === 'snooze') {
      console.log('[update-ui] Version', info.latestVersion, 'was snoozed recently; respecting reminder window.');
      return;
    }
  }
  
  setLatestVersionInfo(info);
  clearSuppressionState();
  updateBannerEl = createUpdateBanner(info);
  document.body.prepend(updateBannerEl);
  document.body.classList.add('has-update-banner');
  
  // Handle button clicks
  updateBannerEl.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const action = target.closest('[data-action]')?.getAttribute('data-action');
    
    if (action === 'install') {
      handleInstallUpdateRequest();
    } else if (action === 'remind') {
      handleRemindLater();
    } else if (action === 'dismiss') {
      handleDismiss();
    } else if (action === 'retry') {
      checkForUpdates();
    }
  });
}

function hideUpdateBanner(): void {
  if (!updateBannerEl) return;
  
  updateBannerEl.classList.add('hiding');
  setTimeout(() => {
    updateBannerEl?.remove();
    updateBannerEl = null;
    document.body.classList.remove('has-update-banner', 'update-downloading');
  }, 200);
}

function handleStatusUpdate(payload: UpdateStatusPayload): void {
  console.log('[update-ui] Status update:', payload.status, payload);
  currentUpdateStatus = payload.status;
  
  switch (payload.status) {
    case 'checking':
      // Optionally show a subtle "Checking for updates..." indicator
      break;
      
    case 'available':
      if (payload.currentVersion && payload.latestVersion) {
        showUpdateBanner({
          currentVersion: payload.currentVersion,
          latestVersion: payload.latestVersion,
        });
      }
      break;
      
    case 'not-available':
      console.log('[update-ui] No update available. Current version is latest.');
      break;
      
    case 'downloading':
      if (updateBannerEl) {
        updateBannerUI('downloading', payload);
      }
      break;
      
    case 'downloaded':
      if (updateBannerEl) {
        updateBannerUI('downloaded', payload);
      } else if (payload.currentVersion && payload.latestVersion) {
        // Show banner if not visible (update was downloaded in background)
        showUpdateBanner({
          currentVersion: payload.currentVersion,
          latestVersion: payload.latestVersion,
        }, { force: true });
        // Immediately update to downloaded state
        setTimeout(() => updateBannerUI('downloaded', payload), 100);
      }
      break;
      
    case 'error':
      console.error('[update-ui] Update error:', payload.error);
      if (updateBannerEl) {
        updateBannerUI('error', payload);
      }
      break;
  }
}

async function checkForUpdates(): Promise<void> {
  console.log('[update-ui] ========== Checking for updates (electron-updater) ==========');
  try {
    const result = await window.autoUpdate?.check();
    console.log('[update-ui] Check result:', result);
    
    if (!result?.ok) {
      console.error('[update-ui] Update check failed:', result?.error);
      return;
    }
    
    if (result.updateAvailable && result.currentVersion && result.latestVersion) {
      showUpdateBanner({
        currentVersion: result.currentVersion,
        latestVersion: result.latestVersion,
      });
    }
  } catch (error) {
    console.error('[update-ui] Failed to check for updates:', error);
  }
}

export function setupUpdateCheck(): void {
  console.log('[update-ui] Setting up update check with electron-updater...');
  
  // Subscribe to status updates from main process
  if (window.autoUpdate?.onStatus) {
    statusListenerCleanup = window.autoUpdate.onStatus(handleStatusUpdate);
  }
  
  // Check immediately on startup (with slight delay to let UI settle)
  setTimeout(() => {
    checkForUpdates();
  }, INITIAL_CHECK_DELAY_MS);
  
  // Check periodically
  setInterval(() => {
    checkForUpdates();
  }, UPDATE_CHECK_INTERVAL_MS);
  
  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    if (statusListenerCleanup) {
      statusListenerCleanup();
      statusListenerCleanup = null;
    }
  });
}

// Add TypeScript declarations for the window.autoUpdate API
declare global {
  interface Window {
    autoUpdate?: {
      check: () => Promise<{
        ok: boolean;
        updateAvailable?: boolean;
        currentVersion?: string;
        latestVersion?: string;
        updateInfo?: any;
        error?: string;
      }>;
      download: () => Promise<{ ok: boolean; error?: string }>;
      install: () => Promise<{ ok: boolean }>;
      getStatus: () => Promise<{
        ok: boolean;
        status?: string;
        currentVersion?: string;
        latestVersion?: string;
        error?: string;
      }>;
      getVersion: () => Promise<{ ok: boolean; version?: string }>;
      onStatus: (callback: (payload: UpdateStatusPayload) => void) => () => void;
    };
    appVersion?: {
      check: () => Promise<any>;
      getCurrent: () => Promise<any>;
      openDownload: (url: string) => Promise<any>;
    };
  }
}

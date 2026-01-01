const fs = require('fs/promises');
const path = require('path');

async function copyDevAppUpdate() {
  const source = path.resolve(__dirname, '..', 'dev-app-update.yml');
  const destDir = path.resolve(__dirname, '..', 'dist', 'main');
  const dest = path.join(destDir, 'dev-app-update.yml');

  try {
    await fs.access(source);
  } catch {
    // Nothing to copy; allow build to proceed without error.
    return;
  }

  try {
    await fs.mkdir(destDir, { recursive: true });
    await fs.copyFile(source, dest);
  } catch (error) {
    console.warn('build:copy-updater could not copy dev-app-update.yml:', error);
  }
}

copyDevAppUpdate();

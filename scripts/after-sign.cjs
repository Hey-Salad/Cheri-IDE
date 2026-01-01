const path = require('node:path');
const { notarize } = require('@electron/notarize');

/**
 * Electron Builder afterSign hook that submits the macOS app for notarization.
 * Electron Builder will invoke this script with the signing context.
 *
 * @param {import('electron-builder').AfterPackContext} context
 */
module.exports = async function notarizeApp(context) {
  const { electronPlatformName, appOutDir, packager } = context;

  if (electronPlatformName !== 'darwin') {
    return;
  }

  const notarizeTarget = (process.env.NOTARIZE_TARGET || '').trim().toLowerCase();
  if (notarizeTarget === 'dmg') {
    console.log('Skipping .app notarization because NOTARIZE_TARGET=dmg; notarization will run on the DMG instead.');
    return;
  }
  if (process.env.SKIP_APP_NOTARIZE === '1') {
    console.log('Skipping .app notarization because SKIP_APP_NOTARIZE=1.');
    return;
  }

  const appleApiKey = process.env.APPLE_API_KEY;
  const appleApiKeyId = process.env.APPLE_API_KEY_ID;
  const appleApiIssuer = process.env.APPLE_API_ISSUER;

  if (!appleApiKey || !appleApiKeyId || !appleApiIssuer) {
    console.warn(
      'Skipping notarization because APPLE_API_KEY, APPLE_API_KEY_ID, or APPLE_API_ISSUER is not set.'
    );
    return;
  }

  const appName = packager.appInfo.productFilename;
  const appBundleId = packager.appInfo.bundleId;
  const appPath = path.join(appOutDir, `${appName}.app`);

  console.log(`Submitting ${appPath} for notarization as ${appBundleId}`);

  await notarize({
    appBundleId,
    appPath,
    appleApiKey,
    appleApiKeyId,
    appleApiIssuer,
  });

  console.log('Notarization request submitted successfully.');
};

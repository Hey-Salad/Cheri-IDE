import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hasNotarizeCreds = Boolean(
  process.env.APPLE_API_KEY &&
  process.env.APPLE_API_KEY_ID &&
  process.env.APPLE_API_ISSUER
);
const shouldSignMac = hasNotarizeCreds || process.env.ENABLE_MAC_SIGNING === 'true';

const config = {
  packagerConfig: {
    appId: 'co.brilliantai.brilliantcode',
    appCategoryType: "public.app-category.developer-tools",
    icon: path.resolve(__dirname, 'resources/BrilliantCode.icns'),
    asar: {
      unpack: '{**/{.**,**}/**/*.node,**/{.**,**}/**/*.node}',
    },
    ignore: [
      /^\/out($|\/)/,
      /^\/out-fail($|\/)/,
      /^\/out-test($|\/)/,
      /^\/release($|\/)/,
      /^\/brilliantcode-darwin-arm64($|\/)/,
      /^\/forge-output\.log$/,
      /^\/forge-debug\.log$/,
      /^\/dist\/cli($|\/)/,
      /^\/PACKAGING\.md$/,
      /^\/SECURE_BACKEND_INTEGRATION\.md$/,
      /^\/\.claude$/,
      /^\/\.env($|.*)/,
      /^\/AI_FLOW\.md$/,
      /^\/README\.md$/,
      /^\/agents\.md$/,
      /^\/\.github($|\/)/,
      /^\/\.vscode($|\/)/,
      /^\/\.tmp-iconsets($|\/)/,
      /^\/frontend($|\/)/,
      /^\/scripts($|\/)/,
      /^\/patches($|\/)/,
      /^\/env($|\/)/,
    ],
    osxSign: shouldSignMac
      ? {
          identity: process.env.MAC_SIGN_IDENTITY || undefined,
          hardenedRuntime: true,
          entitlements: "entitlements.plist",
          "entitlements-inherit": "entitlements.plist",
        }
      : false,
    osxNotarize: hasNotarizeCreds
      ? {
          appleApiKey: process.env.APPLE_API_KEY,
          appleApiKeyId: process.env.APPLE_API_KEY_ID,
          appleApiIssuer: process.env.APPLE_API_ISSUER,
        }
      : undefined,
    protocols: [
      {
        name: 'BrilliantCode Deep Link',
        schemes: ['brilliantcode'],
      },
    ],
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
      config: {},
    },
    {
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
      config: {},
    },
    {
      name: '@electron-forge/maker-deb',
      platforms: ['linux'],
      config: {},
    },
    {
      name: '@electron-forge/maker-rpm',
      platforms: ['linux'],
      config: {},
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;

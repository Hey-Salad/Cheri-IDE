module.exports = {
  appId: 'co.heysalad.cheri',
  productName: 'Cheri',
  artifactName: 'cheri-${version}-${arch}.${ext}',
  directories: {
    output: 'release',
    buildResources: 'resources'
  },
  files: [
    'dist/**/*',
    '!dist/cli/**',
    'package.json'
  ],
  protocols: [
    {
      name: 'Cheri Deep Link',
      schemes: ['cheri']
    }
  ],
  // Auto-update configuration (optional; set `CHERI_PUBLISH_URL` to enable)
  publish: process.env.CHERI_PUBLISH_URL
    ? { provider: 'generic', url: process.env.CHERI_PUBLISH_URL }
    : undefined,
  mac: {
    category: 'public.app-category.developer-tools',
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
    target: ['dmg', 'zip'],
    icon: 'resources/BrilliantCode.icns',
    // Code signing (uses environment variables)
    identity: process.env.CSC_NAME || process.env.CSC_IDENTITY_AUTO_DISCOVERY === 'false' ? null : undefined,
    type: 'distribution',
    // Notarization (optional, requires APPLE_ID and APPLE_APP_SPECIFIC_PASSWORD)
    notarize: process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD ? {
      teamId: process.env.APPLE_TEAM_ID || 'A24823SWLS'
    } : false
  },
  dmg: {
    icon: 'resources/BrilliantCode.icns'
  },
  win: {
    target: [{ target: 'nsis', arch: ['x64', 'arm64'] }],
    artifactName: 'cheri-${version}-${arch}.${ext}'
  },
  linux: {
    target: [
      { target: 'AppImage', arch: ['x64', 'arm64'] },
      { target: 'deb', arch: ['x64', 'arm64'] },
      { target: 'rpm', arch: ['x64', 'arm64'] },
    ],
    category: 'Utility',
    maintainer: 'HeySalad Inc.'
  }
};

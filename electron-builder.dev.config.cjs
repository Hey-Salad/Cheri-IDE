module.exports = {
  appId: 'co.brilliantai.brilliantcode.dev',
  productName: 'BrilliantCode Dev',
  directories: {
    output: 'release-dev',
    buildResources: 'resources',
  },
  files: [
    'dist/**/*',
    '!dist/cli/**',
    'package.json',
  ],
  protocols: [
    {
      name: 'BrilliantCode Dev Deep Link',
      schemes: ['brilliantcode-dev'],
    },
  ],
  extraResources: [
    { from: '.env', to: '.env' },
  ],
  mac: {
    category: 'public.app-category.developer-tools',
    hardenedRuntime: false,
    gatekeeperAssess: false,
    target: ['dir'],
    icon: 'resources/BrilliantCode.icns',
  },
};


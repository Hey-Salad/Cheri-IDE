module.exports = {
  appId: 'co.heysalad.cheri.dev',
  productName: 'Cheri Dev',
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
      name: 'Cheri Dev Deep Link',
      schemes: ['cheri-dev'],
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
    icon: 'resources/cheri-512.png',
  },
};


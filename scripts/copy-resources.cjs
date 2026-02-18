#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

// Copy resources to dist/renderer for production builds
const resourcesSrc = path.resolve(__dirname, '../resources');
const resourcesDest = path.resolve(__dirname, '../dist/renderer/resources');

console.log('[copy-resources] Copying branding assets to dist/renderer/resources...');

// Create dest directory
if (!fs.existsSync(resourcesDest)) {
  fs.mkdirSync(resourcesDest, { recursive: true });
}

// Files to copy for UI branding
const filesToCopy = [
  'cheri-icon.svg',
  'cheri-emoji-icon.svg',
  'favicon.svg',
  'favicon.ico',
  'heysalad-logo-white.svg',
  'heysalad-logo-white.png',
  'heysalad-logo-black.svg'
];

let copied = 0;
for (const file of filesToCopy) {
  const src = path.join(resourcesSrc, file);
  const dest = path.join(resourcesDest, file);

  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    copied++;
  } else {
    console.warn(`  ⚠ File not found: ${file}`);
  }
}

console.log(`[copy-resources] ✓ Copied ${copied}/${filesToCopy.length} branding assets`);

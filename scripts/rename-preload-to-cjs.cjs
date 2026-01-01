#!/usr/bin/env node
// Copy dist/preload/preload.js -> dist/preload/preload.cjs for explicit CJS (keep .js for dev tooling)
const fs = require('node:fs');
const path = require('node:path');

const src = path.resolve(__dirname, '../dist/preload/preload.js');
const dest = path.resolve(__dirname, '../dist/preload/preload.cjs');

try {
  if (!fs.existsSync(src)) {
    console.log('[rename-preload] no preload.js found, skipping');
    process.exit(0);
  }
  try { fs.rmSync(dest, { force: true }); } catch {}
  fs.copyFileSync(src, dest);
  console.log('[rename-preload] copied preload.js -> preload.cjs');
} catch (e) {
  console.error('[rename-preload] failed:', e);
  process.exitCode = 1;
}

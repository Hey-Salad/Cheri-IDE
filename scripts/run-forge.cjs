#!/usr/bin/env node
const { spawn } = require('node:child_process');
const path = require('node:path');

const forgeBinRel = require('@electron-forge/cli/package.json').bin['electron-forge'];
const forgeBinAbs = path.resolve(__dirname, '../node_modules/@electron-forge/cli', forgeBinRel);
const args = process.argv.slice(2);

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(process.execPath, [forgeBinAbs, ...args], {
  stdio: 'inherit',
  env,
});

child.on('exit', (code) => {
  process.exitCode = code ?? 0;
});


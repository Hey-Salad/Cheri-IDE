#!/usr/bin/env node
const { spawn } = require('node:child_process');

const electronPath = require('electron');
const args = process.argv.slice(2);

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, args.length ? args : ['.'], {
  stdio: 'inherit',
  env,
});

child.on('exit', (code) => {
  process.exitCode = code ?? 0;
});


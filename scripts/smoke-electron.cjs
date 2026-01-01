#!/usr/bin/env node
const { spawn } = require('node:child_process');

const timeoutMs = Number.parseInt(process.env.SMOKE_TIMEOUT_MS ?? '5000', 10);
const electronArgs = process.argv.slice(2);

const electronPath = require('electron');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const electron = spawn(electronPath, ['.', ...electronArgs], {
  stdio: 'inherit',
  env,
});

const timer = setTimeout(() => {
  try {
    electron.kill('SIGTERM');
  } catch {}
  process.exit(0);
}, Number.isFinite(timeoutMs) ? timeoutMs : 5000);

electron.on('exit', (code) => {
  clearTimeout(timer);
  process.exitCode = code ?? 0;
});

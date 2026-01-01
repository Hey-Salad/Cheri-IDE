import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

function findDevApp() {
  const root = path.resolve('release-dev');
  if (!fs.existsSync(root)) {
    throw new Error('release-dev does not exist. Run `npm run dist:devapp` first.');
  }

  const apps = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    if (!dir) continue;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.endsWith('.app')) {
          apps.push(full);
        } else {
          stack.push(full);
        }
      }
    }
  }

  const preferred = apps.find((p) => path.basename(p).toLowerCase() === 'brilliantcode dev.app');
  if (preferred) return preferred;
  if (apps.length === 1) return apps[0];
  if (apps.length > 1) {
    const sorted = apps.slice().sort();
    return sorted[sorted.length - 1];
  }
  throw new Error('No .app found under release-dev.');
}

function run(cmd, args) {
  const res = spawnSync(cmd, args, { stdio: 'inherit' });
  if (res.error) throw res.error;
  if (typeof res.status === 'number' && res.status !== 0) {
    throw new Error(`${cmd} exited with code ${res.status}`);
  }
}

const appPath = findDevApp();
console.log('[dev-app] Registering:', appPath);
run('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister', ['-f', appPath]);
console.log('[dev-app] Done. You can test with: open "brilliantcode-dev://callback?sanity=1"');

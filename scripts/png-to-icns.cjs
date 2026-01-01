#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

function ensureTool(binary) {
  const result = spawnSync(binary, ['-h'], { stdio: 'ignore' });
  if (result.error) {
    if (result.error.code === 'ENOENT') {
      console.error(`Required tool "${binary}" was not found in PATH.`);
    } else {
      console.error(`Failed to run "${binary}":`, result.error.message);
    }
    process.exit(1);
  }
}

function usage() {
  console.error('Usage: node scripts/png-to-icns.cjs <source.png> [output.icns]');
  process.exit(1);
}

const [, , sourceArg, outputArg] = process.argv;
if (!sourceArg) {
  usage();
}

ensureTool('sips');
ensureTool('iconutil');

const sourcePath = path.resolve(process.cwd(), sourceArg);
if (!fs.existsSync(sourcePath)) {
  console.error(`Source file not found: ${sourcePath}`);
  process.exit(1);
}

const parsed = path.parse(sourcePath);
if (parsed.ext.toLowerCase() !== '.png') {
  console.error('Source must be a .png file.');
  process.exit(1);
}

const outputPath = path.resolve(
  process.cwd(),
  outputArg || path.join(parsed.dir, `${parsed.name}.icns`),
);

function readImageBounds(filePath) {
  try {
    const result = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', filePath], {
      encoding: 'utf8',
    });
    const widthMatch = result.match(/pixelWidth: (\d+)/);
    const heightMatch = result.match(/pixelHeight: (\d+)/);
    return {
      width: widthMatch ? parseInt(widthMatch[1], 10) : null,
      height: heightMatch ? parseInt(heightMatch[1], 10) : null,
    };
  } catch (error) {
    console.warn('Could not read image dimensions via sips:', error.message);
    return { width: null, height: null };
  }
}

const bounds = readImageBounds(sourcePath);
if (bounds.width && bounds.height) {
  const minSide = Math.min(bounds.width, bounds.height);
  if (minSide < 1024) {
    console.warn('Warning: Apple recommends at least 1024x1024px input for best results.');
  }
}

const tempBase = path.join(process.cwd(), '.tmp-iconsets');
if (!fs.existsSync(tempBase)) {
  fs.mkdirSync(tempBase, { recursive: true });
}
const tempRoot = fs.mkdtempSync(path.join(tempBase, 'png-to-icns-'));
const iconsetDir = path.join(tempRoot, 'icon.iconset');

fs.mkdirSync(iconsetDir, { recursive: true });

const targets = [16, 32, 128, 256, 512];

function resize(size, scale) {
  const dimension = size * scale;
  const scaleSuffix = scale === 2 ? '@2x' : '';
  const fileName = `icon_${size}x${size}${scaleSuffix}.png`;
  const destination = path.join(iconsetDir, fileName);
  execFileSync('sips', ['-z', String(dimension), String(dimension), sourcePath, '--out', destination], {
    stdio: 'ignore',
  });
}

try {
  for (const target of targets) {
    resize(target, 1);
    resize(target, 2);
  }
  const entries = fs.readdirSync(iconsetDir).sort();
  if (process.env.ICON_DEBUG) {
    console.log('Generated iconset entries:', entries);
  }
  execFileSync('iconutil', ['-c', 'icns', iconsetDir, '-o', outputPath], { stdio: 'inherit' });
  console.log(`Wrote ${outputPath}`);
} catch (error) {
  console.error('Failed to generate .icns:', error.message);
  process.exitCode = 1;
} finally {
  if (process.env.ICON_KEEP_TEMP) {
    console.log(`Temporary files retained at ${iconsetDir}`);
  } else {
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch (cleanupError) {
      console.warn('Could not remove temporary directory:', cleanupError.message);
    }
  }
}

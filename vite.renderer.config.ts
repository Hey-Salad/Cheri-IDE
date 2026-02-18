import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

const __dirname = path.dirname(fileURLToPath(new URL(import.meta.url)));

export default defineConfig({
  root: path.resolve(__dirname, 'src/renderer'),
  base: './',
  server: { port: 5174, strictPort: true },
  build: {
    outDir: path.resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    rollupOptions: {
      // Build multiple HTML entry points so childIndex.html is emitted to dist
      input: {
        index: path.resolve(__dirname, 'src/renderer/index.html'),
        childIndex: path.resolve(__dirname, 'src/renderer/childIndex.html'),
        welcome: path.resolve(__dirname, 'src/renderer/welcome.html'),
      },
      output: {
        // Keep large dependencies in separate chunks for better code splitting
        manualChunks(id) {
          if (id.includes('monaco-editor')) return 'monaco';
          if (id.includes('xterm') || id.includes('xterm-addon')) return 'xterm';
          if (id.includes('highlight.js')) return 'highlight';
        },
      },
    },
  },
});

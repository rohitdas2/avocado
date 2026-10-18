import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  // GitHub Pages serves the site under /avocado/; Flask serves it at the root.
  base: process.env.VITE_BASE || '/',
  build: { outDir: '../dist', emptyOutDir: true },
  // Preserve the browser-facing Host so Flask can compare it with Origin.
  server: { host: '127.0.0.1', proxy: { '/api': { target: 'http://127.0.0.1:3001', changeOrigin: false } } }
});

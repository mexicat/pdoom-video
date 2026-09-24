import { defineConfig } from 'vite';
import path from 'node:path';

// The repo root holds audio/ and data/; serve them next to the app.
export default defineConfig({
  root: '.',
  publicDir: 'public',
  server: { port: 5173, strictPort: false, fs: { allow: [path.resolve(import.meta.dirname, '..')] } },
  resolve: { alias: { '@root': path.resolve(import.meta.dirname, '..') } },
  build: { target: 'esnext', assetsInlineLimit: 0 },
});

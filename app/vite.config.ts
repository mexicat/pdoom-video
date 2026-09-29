import { defineConfig, type Plugin } from 'vite';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

// The repo root holds audio/ and data/; serve them next to the app. public/audio and public/data are
// git symlinks, which a Windows checkout turns into plain text files, so route the URLs to the repo
// root through Vite's /@fs/ file server instead (it handles Range requests, which <audio> seeking needs).
function rootAssets(dirs: string[]): Plugin {
  const fsRoot = `/@fs/${ROOT.replace(/\\/g, '/').replace(/^\//, '')}`;
  return {
    name: 'root-assets',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url && dirs.some((d) => req.url!.startsWith(`/${d}/`))) req.url = fsRoot + req.url;
        next();
      });
    },
  };
}

export default defineConfig({
  root: '.',
  publicDir: 'public',
  plugins: [rootAssets(['audio', 'data'])],
  // PDOOM_NO_HMR=1: no live reload (export renders must not reload mid-run when a file changes)
  server: { port: 5173, strictPort: false, hmr: process.env.PDOOM_NO_HMR ? false : undefined, fs: { allow: [ROOT] } },
  resolve: { alias: { '@root': ROOT } },
  build: { target: 'esnext', assetsInlineLimit: 0 },
});

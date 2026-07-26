import { defineConfig } from 'vite';

// HVAS engine build. base '' keeps asset URLs relative so the built app works
// from any subpath (GitHub Pages /hvas/game/ included).
export default defineConfig({
  base: '',
  build: {
    target: 'es2021',
    outDir: 'dist',
    assetsDir: 'chunks',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000,
  },
  server: {
    host: true,
    port: 5173,
  },
});

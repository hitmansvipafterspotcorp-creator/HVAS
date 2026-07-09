import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Deployed under GitHub Pages project path https://<org>.github.io/HVAS/
// (repo name is 'HVAS' — case-sensitive path), so every built URL
// (index.html, bundled JS/CSS) is served from /HVAS/. Runtime asset strings
// in src/main.jsx are prefixed with this same base via import.meta.env.BASE_URL
// (see the prefixAssets() pass there).
export default defineConfig({
  base: '/HVAS/',
  plugins: [react()],
});

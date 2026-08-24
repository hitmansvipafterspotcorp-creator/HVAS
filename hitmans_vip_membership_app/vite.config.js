import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Deployed under GitHub Pages project path https://<org>.github.io/HVAS/
// (repo name is 'HVAS' — case-sensitive path), so every built URL
// (index.html, bundled JS/CSS) is served from /HVAS/. Runtime asset strings
// in src/main.jsx are prefixed with this same base via import.meta.env.BASE_URL
// (see the prefixAssets() pass there).

// Every build gets an identity, and that identity is what keeps members up to
// date: the app fetches version.json and compares. A commit sha is used rather
// than a timestamp on purpose — rebuilding the same commit twice must NOT look
// like a new version, or every rebuild reloads the app in every member's hand
// for no reason. Only a dirty tree (a local dev build) falls back to a clock.
function buildId() {
  const run = (cmd) => execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  try {
    const sha = run('git rev-parse --short HEAD');
    return run('git status --porcelain') ? `${sha}-dev${Date.now().toString(36)}` : sha;
  } catch {
    return `t${Date.now().toString(36)}`;   // no git here — a clock is better than nothing
  }
}

// Publishes the build's identity two places:
//   • version.json — what the running app polls to notice it is out of date.
//   • sw.js        — stamped so the FILE ITSELF differs every deploy. A browser
//     only installs a new service worker when the script bytes change, so a
//     constant version meant the worker never refreshed its precache and an
//     offline member kept whatever build first reached them.
function stampBuild(id) {
  return {
    name: 'hvas-stamp-build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ build: id, at: new Date().toISOString() }),
      });
    },
    closeBundle() {
      // public/ is copied verbatim, and that copy lands after the bundle is
      // written — so the stamp goes on afterwards, on the file in dist/.
      const sw = join(__dirname, 'dist', 'sw.js');
      if (!existsSync(sw)) return;
      const src = readFileSync(sw, 'utf8');
      if (!src.includes('hvas-dev')) {
        throw new Error('sw.js has no hvas-dev placeholder to stamp — the cache version would never change');
      }
      writeFileSync(sw, src.replace(/hvas-dev/g, `hvas-${id}`));
    },
  };
}

const BUILD = buildId();

export default defineConfig({
  base: '/HVAS/',
  define: { __BUILD_ID__: JSON.stringify(BUILD) },
  plugins: [react(), stampBuild(BUILD)],
});

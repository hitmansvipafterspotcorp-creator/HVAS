// Works out the exact set of public/ assets the built bundle actually
// references, so a deploy ships those and ONLY those.
//
// Prints a count line, then one asset path per line.
//   node scripts/extract-asset-refs.mjs
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(APP, 'dist');
const assetDir = path.join(distDir, 'assets');
const publicDir = path.join(APP, 'public');

const sources = readdirSync(assetDir)
  .filter((f) => f.endsWith('.js') || f.endsWith('.css'))
  .map((f) => path.join(assetDir, f))
  .concat([path.join(distDir, 'index.html')]);

// Asset references survive the build in three different shapes:
//   "/assets/..."       plain absolute string literals
//   "/HVAS/assets/..."  CSS url() with the deploy base baked in
//   "assets/..."        template literals — `${import.meta.env.BASE_URL}assets/...`
// That last, bare form is easy to miss: matching only a leading-slash path
// silently dropped every loyalty rank badge from the deploy, so they 404'd
// on the live site while looking fine locally. Match all three.
const re = /(?:\/HVAS)?\/?assets\/[A-Za-z0-9_\-./%]+\.(?:png|jpg|jpeg|webp|svg|mp4|webm|ico|woff2?|ttf)/g;

const refs = new Set();
for (const f of sources) {
  const text = readFileSync(f, 'utf8');
  let m;
  while ((m = re.exec(text))) {
    const rel = m[0].replace(/^\/HVAS\//, '').replace(/^\//, ''); // -> assets/...
    // The bare `assets/` form is loose enough to occasionally catch a
    // non-asset substring, so only keep refs that really exist in public/.
    if (existsSync(path.join(publicDir, rel))) refs.add(`/${rel}`);
  }
}

const sorted = [...refs].sort();
console.log(`${sorted.length} referenced asset paths found`);
process.stdout.write(sorted.join('\n') + '\n');

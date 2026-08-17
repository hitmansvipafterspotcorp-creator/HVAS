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

// A path built from a variable — `assets/ui/kit/${name}.png` — compiles to a
// concatenation, and nothing below can see it. That has now shipped a broken
// live site twice: once for the loyalty rank badges, once for the square
// marks. So fail the deploy instead of quietly leaving files behind.
const dynamic = new Set();
for (const f of sources) {
  const text = readFileSync(f, 'utf8');
  for (const m of text.matchAll(/assets\/[A-Za-z0-9_\-./]*(?:\$\{|"\s*\+|'\s*\+)/g)) {
    dynamic.add(m[0].replace(/(\$\{|"\s*\+|'\s*\+)$/, ''));
  }
}
if (dynamic.size) {
  console.error('\nDYNAMIC ASSET PATHS — these cannot be resolved, so they would deploy missing:');
  for (const d of dynamic) console.error(`  ${d}\${...}  <- write the full filename out instead`);
  console.error('');
  process.exit(1);
}

const sorted = [...refs].sort();
console.log(`${sorted.length} referenced asset paths found`);
process.stdout.write(sorted.join('\n') + '\n');

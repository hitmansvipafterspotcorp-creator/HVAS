// Assemble the gh-pages tree from a fresh build.
//
// The Pages workflow publishes gh-pages, NOT the branch that triggers it — so
// pushing source changes nothing on the live site until this runs. That is how
// the app sat four days stale once already.
//
// Two things must survive the copy:
//   • venues.json  — the room directory, written by publish-beacon.mjs against
//     the LIVE branch. The copy in dist/ is the empty template from public/,
//     and shipping it would erase the venue from its own directory.
//   • .nojekyll / .github — deploy plumbing that is not part of the app.
//
// And only the assets the bundle actually references get shipped: dist/ carries
// all 194MB of public/, of which 181 files are used.
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const APP = '/home/claude/hvas/hitmans_vip_membership_app';
const DIST = path.join(APP, 'dist');
const GHP = process.env.GHP_DIR || '/tmp/ghp';

const keptBeacon = readFileSync(path.join(GHP, 'venues.json'), 'utf8');
const before = JSON.parse(keptBeacon).venues?.length ?? 0;

// Which public assets the bundle actually names.
const out = execFileSync('node', [path.join(APP, 'scripts/extract-asset-refs.mjs')], { encoding: 'utf8' });
const refs = out.split('\n').slice(1).map((l) => l.trim()).filter(Boolean)
  .map((p) => p.replace(/^\/?(HVAS\/)?/, ''));            // -> assets/...

// Clear what the build owns; leave the rest of the branch alone.
for (const d of ['assets', 'icons']) rmSync(path.join(GHP, d), { recursive: true, force: true });
for (const f of ['index.html', 'manifest.webmanifest', 'sw.js', 'version.json']) rmSync(path.join(GHP, f), { force: true });

// The bundle itself.
mkdirSync(path.join(GHP, 'assets'), { recursive: true });
for (const f of readdirSync(path.join(DIST, 'assets'))) {
  if (/\.(js|css)$/.test(f)) cpSync(path.join(DIST, 'assets', f), path.join(GHP, 'assets', f));
}
// version.json is what every installed app polls to find out it is out of
// date. Leaving it out of the deploy does not break anything visibly — it just
// means no phone ever updates itself again, silently, forever.
for (const f of ['index.html', 'manifest.webmanifest', 'sw.js', 'version.json']) {
  if (existsSync(path.join(DIST, f))) cpSync(path.join(DIST, f), path.join(GHP, f));
}
if (!existsSync(path.join(DIST, 'version.json'))) {
  throw new Error('dist/version.json is missing — the build did not stamp itself and no member would ever update');
}
if (existsSync(path.join(DIST, 'icons'))) cpSync(path.join(DIST, 'icons'), path.join(GHP, 'icons'), { recursive: true });

// Only the referenced public assets.
let copied = 0, missing = [];
for (const rel of refs) {
  const src = path.join(DIST, decodeURIComponent(rel));
  if (!existsSync(src)) { missing.push(rel); continue; }
  const dest = path.join(GHP, decodeURIComponent(rel));
  mkdirSync(path.dirname(dest), { recursive: true });
  cpSync(src, dest);
  copied += 1;
}

// Put the live directory back, untouched.
writeFileSync(path.join(GHP, 'venues.json'), keptBeacon);
if (!existsSync(path.join(GHP, '.nojekyll'))) writeFileSync(path.join(GHP, '.nojekyll'), '');

console.log(`bundle + ${copied} referenced assets copied`);
if (missing.length) console.log(`  ${missing.length} referenced but not in dist: ${missing.slice(0,5).join(', ')}`);
console.log(`venues.json preserved with ${before} venue(s)`);
console.log(`published build ${JSON.parse(readFileSync(path.join(GHP, 'version.json'), 'utf8')).build}`);

// EVERY BROWSER SUITE, IN ONE COMMAND.
//
//   node qa/browser/gate.mjs
//
// These suites drive a real Chromium over CDP and are the only things in this
// repo that check what a member actually SEES. They also sat outside every
// gate, which is how two of them came to be broken for weeks without anyone
// knowing — and they were not broken in some cosmetic way. One had stopped at
// the sign-in screen entirely; the other was parked on a step of joining that
// had moved. Both were reporting real product bugs nobody was reading:
// a returning member had no box to type a staff-issued code into, and a member
// who resigned was shown the joining gate forever with the way back behind it.
//
// A suite nothing runs is not a safety net. It is a file.
//
// Chromium is not on a venue laptop, so this SKIPS there rather than failing —
// but it says so out loud, because a gate that goes quiet when it cannot do its
// job is worse than one that is missing.
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const CHROME = process.env.HVAS_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

if (!existsSync(CHROME)) {
  console.log('BROWSER GATE — SKIPPED');
  console.log(`  No Chromium at ${CHROME}.`);
  console.log('  These suites need a real browser. Set HVAS_CHROME to one to run them.');
  console.log('  Nothing was checked. This is not a pass.');
  process.exit(0);
}

// Build first. These suites serve hitmans_vip_membership_app/dist, so without
// this they happily test whatever bundle was lying there — which passes while
// the change you actually made is not in it. A green run against stale output
// is the most expensive kind of green there is.
const app = resolve(here, '../../hitmans_vip_membership_app');
console.log('Building the app so these test what is actually in the source...');
const built = await new Promise((res) => {
  const c = spawn('npm', ['run', 'build'], { cwd: app, stdio: ['ignore', 'ignore', 'inherit'] });
  c.on('error', () => res(false));
  c.on('close', (code) => res(code === 0));
});
if (!built) {
  console.log('\nBROWSER GATE FAILED — the app did not build, so there is nothing honest to test.');
  process.exit(1);
}
if (!existsSync(resolve(app, 'dist/index.html'))) {
  console.log('\nBROWSER GATE FAILED — the build produced no dist/index.html.');
  process.exit(1);
}

// Alphabetical, so the order is the same everywhere and a failure is easy to
// find again. Sequential, not parallel: each suite pins its own CDP debugging
// port and two running at once fight over it.
const suites = readdirSync(here)
  .filter((f) => f.endsWith('.mjs') && f !== 'gate.mjs')
  .sort();

const run = (file) => new Promise((res) => {
  const started = Date.now();
  const child = spawn(process.execPath, [resolve(here, file)], { cwd: here, stdio: 'inherit' });
  child.on('close', (code) => res({ file, code, ms: Date.now() - started }));
});

const results = [];
for (const f of suites) {
  console.log(`\n${'='.repeat(60)}\n  ${f}\n${'='.repeat(60)}`);
  results.push(await run(f));
}

console.log(`\n${'='.repeat(60)}`);
const failed = results.filter((r) => r.code !== 0);
for (const r of results) {
  console.log(`  ${r.code === 0 ? 'ok  ' : 'FAIL'}  ${r.file.padEnd(24)} ${(r.ms / 1000).toFixed(0)}s`);
}
if (failed.length) {
  console.log(`\nBROWSER GATE FAILED — ${failed.length} of ${results.length} suites: ${failed.map((f) => f.file).join(', ')}`);
  process.exit(1);
}
console.log(`\nBROWSER GATE PASSED — ${results.length} suites clean.`);

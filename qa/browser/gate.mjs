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
import { spawn, execFileSync } from 'node:child_process';
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

// Every suite gets a deadline.
//
// These drive a browser over a socket, and there are a dozen ways for one to
// stop without ending: a WebSocket that never opens, a CDP reply that never
// comes back, a Chromium that starts but never listens. None of them fail —
// they park, forever, on an await that has nothing behind it. One suite did
// exactly that here and took the whole gate with it, which is worse than any
// test failing: the keeper runs this before it deploys, so a gate that can
// hang is a venue that can never take an update again. That is the same shape
// as the bug that took the venue down this morning.
//
// A suite that has gone quiet for this long is not going to finish. Kill it,
// call it failed, and carry on to the next one — a report with one FAIL in it
// is worth infinitely more than a run that never returns.
const SUITE_TIMEOUT_MS = Number(process.env.HVAS_SUITE_TIMEOUT_MS || 8 * 60 * 1000);

const run = (file) => new Promise((res) => {
  const started = Date.now();
  const child = spawn(process.execPath, [resolve(here, file)], { cwd: here, stdio: 'inherit' });
  let timedOut = false;
  const killer = setTimeout(() => {
    timedOut = true;
    console.log(`\n  [gate] ${file} has produced nothing for ${Math.round(SUITE_TIMEOUT_MS / 1000)}s — killing it.`);
    try { child.kill('SIGKILL'); } catch {}
  }, SUITE_TIMEOUT_MS);
  child.on('close', (code) => {
    clearTimeout(killer);
    res({ file, code: timedOut ? 'TIMEOUT' : code, ms: Date.now() - started });
  });
});

// A suite killed mid-run leaves its browser behind, and the next suite pins the
// same debugging port — so one hang would cascade into every suite after it
// failing for a reason that has nothing to do with the code under test.
const reap = () => {
  try { execFileSync('pkill', ['-9', '-f', 'chrome-linux/chrome'], { stdio: 'ignore' }); } catch { /* none left */ }
};

const results = [];
for (const f of suites) {
  console.log(`\n${'='.repeat(60)}\n  ${f}\n${'='.repeat(60)}`);
  const r = await run(f);
  if (r.code !== 0) reap();
  results.push(r);
}

console.log(`\n${'='.repeat(60)}`);
const failed = results.filter((r) => r.code !== 0);
for (const r of results) {
  const mark = r.code === 0 ? 'ok  ' : r.code === 'TIMEOUT' ? 'HUNG' : 'FAIL';
  console.log(`  ${mark}  ${r.file.padEnd(24)} ${(r.ms / 1000).toFixed(0)}s`);
}
if (failed.length) {
  console.log(`\nBROWSER GATE FAILED — ${failed.length} of ${results.length} suites: ${failed.map((f) => f.file).join(', ')}`);
  process.exit(1);
}
console.log(`\nBROWSER GATE PASSED — ${results.length} suites clean.`);

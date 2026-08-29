// The one command the deploy keeper runs before it ships new code.
//
// The keeper spawns its test command with shell:false and splits it on spaces,
// so it cannot chain "a && b" — and pointing it at a single suite means every
// other suite silently stops gating deploys. This runs them in order and fails
// on the first one that does, so a broken mode never reaches the venue mid-set.
//
// process.execPath, not "node": on Windows the keeper may be started from a
// launcher whose PATH has no node on it, but the running node always knows
// where it lives.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SUITES = ['test.mjs', 'lipsync-test.mjs', 'bingo-modes-test.mjs', 'clip-timer-test.mjs', 'hook-test.mjs', 'stream-test.mjs', 'tunnel-pick-test.mjs', 'render-safety-test.mjs', 'deck-sync-test.mjs', 'yt-search-test.mjs', 'prize-test.mjs', 'entry-test.mjs', 'economy-test.mjs', 'ip-test.mjs', 'jubilee-test.mjs', 'jubilee-api-test.mjs', 'staff-test.mjs', 'pulse-test.mjs', 'chrome-test.mjs', 'program-test.mjs', 'privacy-test.mjs', 'drill-2030-test.mjs', 'onboarding-test.mjs', 'license-test.mjs', 'earning-test.mjs', 'verify-test.mjs', 'pma-test.mjs', 'roles-test.mjs',
  // A whole evening lived rather than asserted. It found two defects the
  // moment it was first played, with everything else already green.
  'night-test.mjs',
  // What members do with each other, and the door that gates it.
  'room-test.mjs',
  // Two venue nodes, separate databases, no cloud — and one of them dying
  // mid-night without taking the night with it.
  'cluster-test.mjs',
  // ── The layers under all of it ───────────────────────────────────────────
  //
  // These eight were passing and ungated, which is the same state cluster-test
  // was in when it turned out to have been broken for weeks. A suite nothing
  // runs is not a safety net, it is a file.
  //
  // They are the mesh the venue converges over, the money rails, the offline
  // shell and the deploy keeper — the layers everything above assumes and
  // nothing above would notice the loss of until a night went wrong.
  'mesh-test.mjs', 'mesh-tcp-test.mjs', 'mesh-encrypted-test.mjs', 'network-test.mjs',
  'pay-test.mjs', 'local-app-test.mjs', 'deploy-keeper-test.mjs',
  // Bluetooth: staff phones meshing with no wifi, no router and no cell tower.
  // Runs against a simulated radio, so it needs no hardware and belongs here.
  '../native/ble-test.mjs',
  // And finding those phones in the first place: dedupe, cool-off, letting go
  // of a link that ended, and leaving nothing behind when the app closes.
  '../native/ble-mesh-test.mjs',
  // hitkoin-test is deliberately NOT here: it needs a live chain and an RPC URL,
  // and a gate that cannot pass on a laptop is a gate people learn to skip.
  //
  // Last, and the one that matters most on a night: a stranger signs up and
  // the door lets them in. If this fails, nothing else being green helps.
  'launch-test.mjs',
  // And the same walk with sixty people on it at once, because a queue is how
  // opening night differs from every test above it.
  'rush-test.mjs',
  // Every route in the building, fed every wrong shape, by every kind of
  // caller. A 500 reads as "the venue is down" and sends somebody to restart a
  // laptop that was fine, so no route is allowed to answer rubbish with one.
  'rubbish-test.mjs',
  // A room full of phones hanging up mid-stream must not take the venue down,
  // stop the door, or silence a staff device that is still watching.
  'stream-hangup-test.mjs'];

const run = (file) => new Promise((res) => {
  const child = spawn(process.execPath, [resolve(__dirname, file)], { cwd: __dirname, stdio: 'inherit' });
  child.on('error', (e) => { console.error(`  ✗ could not start ${file}: ${e.message}`); res(false); });
  child.on('close', (code) => res(code === 0));
});

for (const suite of SUITES) {
  console.log(`\n───── ${suite} ─────`);
  if (!(await run(suite))) {
    console.error(`\nGATE FAILED on ${suite} — not deploying.`);
    process.exit(1);
  }
}
// The browser suites — the only things here that check what a member SEES.
//
// They are not in SUITES because they need a real Chromium, and a venue laptop
// does not have one: requiring it would make the keeper reject every deploy on
// the machine that matters most. So they run when a browser is available and
// say plainly when it is not.
//
// Leaving them entirely outside a gate is what let two of them break for weeks
// while reporting real product bugs nobody read.
const browserGate = resolve(__dirname, '../qa/browser/gate.mjs');
if (process.env.HVAS_SKIP_BROWSER === '1') {
  console.log('\n───── browser suites: SKIPPED (HVAS_SKIP_BROWSER=1) ─────');
} else if (existsSync(browserGate)) {
  console.log('\n───── browser suites ─────');
  if (!(await run('../qa/browser/gate.mjs'))) {
    console.error('\nGATE FAILED in the browser suites — not deploying.');
    process.exit(1);
  }
}

console.log(`\nGATE PASSED — ${SUITES.length} suites clean.`);

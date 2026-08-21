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
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SUITES = ['test.mjs', 'lipsync-test.mjs', 'bingo-modes-test.mjs', 'clip-timer-test.mjs', 'hook-test.mjs', 'stream-test.mjs', 'tunnel-pick-test.mjs', 'render-safety-test.mjs'];

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
console.log(`\nGATE PASSED — ${SUITES.length} suites clean.`);

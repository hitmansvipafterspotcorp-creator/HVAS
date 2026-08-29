// HVAS Deploy Keeper — an in-house, zero-dependency process supervisor.
// Keeps the backend self-running with no external PaaS:
//   1) restarts the app if it crashes (with backoff, so a real crash loop
//      doesn't hammer the machine)
//   2) watches the deploy branch for new commits and rolls them out live —
//      but ONLY after the test suite passes against the new code. A failing
//      test rolls the checkout back and leaves the current process running.
//
// Run it once (e.g. under systemd, or just `nohup ... &`) and it keeps the
// venue's backend up and current with no one SSHing in.
//
//   node deploy-keeper.mjs
//
// Env:
//   KEEPER_CMD             command that runs the app        default "node host.mjs"
//   KEEPER_CWD              working dir for KEEPER_CMD        default this dir
//   KEEPER_REPO_ROOT        git repo root to track            default parent of this dir
//   KEEPER_BRANCH           branch to deploy from              default: whatever is checked out
//   KEEPER_POLL_SECONDS     how often to check for commits    default 120
//   KEEPER_TEST_CMD         must exit 0 before a deploy ships default "node test.mjs"
//   KEEPER_STATUS_FILE      where live status JSON is written default ./data/keeper-status.json
//   KEEPER_HEAL_AFTER_CRASHES  startup crashes in a row before it re-syncs   default 5
//   KEEPER_NOTIFY_WEBHOOK   optional URL, POSTed on events (fire-and-forget, never blocks a deploy)
//
// This script does `git merge --ff-only` / `git reset --hard` in KEEPER_REPO_ROOT.
// Point it at a DEDICATED deploy checkout, not a directory you edit by hand.
//
// If it finds locally-modified TRACKED files, it copies them aside into
// data/clobbered-<timestamp>/ and then discards them, because a venue laptop
// mid-shift has no way to resolve a merge conflict and a half-edited source
// file is how the whole night goes down. Untracked and ignored files —
// server/.env, data/, venue-key.json — are never touched.

import { spawn, execFile } from 'node:child_process';
import { writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CWD = process.env.KEEPER_CWD || __dirname;
const REPO_ROOT = process.env.KEEPER_REPO_ROOT || resolve(__dirname, '..');
const CMD = process.env.KEEPER_CMD || 'node host.mjs';
// "node test.mjs" directly, not "npm test" — on Windows, npm resolves to
// npm.cmd, which itself shells out to npm.ps1, and PowerShell's default
// execution policy blocks running .ps1 scripts. That makes the test
// command exit non-zero before the real suite ever runs, so every deploy
// gets falsely rejected as "tests failed" even when the code is fine.
// Calling node directly skips npm entirely — no shell, no policy to trip.
// test-gate.mjs runs every suite in turn — see the note in that file for why
// this is one command and not a chained 'a && b'.
const TEST_CMD = process.env.KEEPER_TEST_CMD || 'node test-gate.mjs';
const POLL_MS = Number(process.env.KEEPER_POLL_SECONDS || 120) * 1000;
const STATUS_FILE = process.env.KEEPER_STATUS_FILE || resolve(CWD, 'data', 'keeper-status.json');
const WEBHOOK = process.env.KEEPER_NOTIFY_WEBHOOK || '';

function git(args) {
  return new Promise((res, rej) => {
    execFile('git', ['-C', REPO_ROOT, ...args], { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) rej(new Error(stderr || err.message));
      else res(stdout.trim());
    });
  });
}

function run(cmd, cwd) {
  return new Promise((res) => {
    const [bin, ...args] = cmd.split(' ');
    const child = spawn(bin, args, { cwd, shell: false, stdio: 'pipe' });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('error', (e) => (out += String(e)));
    child.on('close', (code) => res({ ok: code === 0, out, code }));
  });
}

const status = { pid: null, restarts: 0, crashStreak: 0, sha: null, branch: null, upSince: null, lastEvent: null };
function writeStatus() {
  try {
    mkdirSync(dirname(STATUS_FILE), { recursive: true });
    writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2));
  } catch { /* status file is diagnostic only — never let it block the keeper */ }
}

async function notify(event, detail) {
  status.lastEvent = { event, detail, at: new Date().toISOString() };
  writeStatus();
  console.log(`[keeper] ${event}: ${detail}`);
  if (!WEBHOOK) return;
  try {
    await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(status.lastEvent),
    });
  } catch { /* best effort only */ }
}

let child = null;
let deploying = false;
let backoffMs = 1000;
let steadyTimer = null;
let restartTimer = null;
let crashStreak = 0;         // crashes in a row with no run that lasted a minute
const HEAL_AFTER_CRASHES = Number(process.env.KEEPER_HEAL_AFTER_CRASHES || 5);

function startChild() {
  if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
  const [bin, ...args] = CMD.split(' ');
  child = spawn(bin, args, { cwd: CWD, stdio: 'inherit', env: process.env });
  status.pid = child.pid;
  status.upSince = new Date().toISOString();
  writeStatus();
  child.on('exit', (code, signal) => {
    // The "we survived a minute, forget the backoff" timer belongs to THIS run.
    // Left uncancelled it kept firing from earlier runs, so a process dying
    // every 200ms still had its backoff reset to 1s once a minute had passed
    // overall — which is why a crash loop printed "restarting in 1000ms"
    // forever instead of easing off to 30s the way it was supposed to.
    if (steadyTimer) { clearTimeout(steadyTimer); steadyTimer = null; }
    // Requested by us for a redeploy, not a crash — and the code about to run
    // is different code, so it doesn't inherit the old one's crash streak.
    if (deploying) { crashStreak = 0; status.crashStreak = 0; return; }
    crashStreak += 1;
    notify('crash', `app exited (code ${code}, signal ${signal}) — restarting in ${backoffMs}ms (${crashStreak} in a row)`);
    status.restarts += 1;
    status.crashStreak = crashStreak;
    restartTimer = setTimeout(startChild, backoffMs);
    backoffMs = Math.min(backoffMs * 2, 30_000);
    // Restarting a binary that cannot start is not a recovery strategy. Past a
    // handful of tries, go and fix the checkout it's starting from.
    if (crashStreak === HEAL_AFTER_CRASHES) selfHeal();
  });
  steadyTimer = setTimeout(() => {
    backoffMs = 1000;
    crashStreak = 0;
    status.crashStreak = 0;
    writeStatus();
  }, 60_000); // stable for a minute => forget prior backoff
}

// Waiting on 'exit' from a process that already exited waits forever: the event
// fired before we ever listened, and the SIGKILL fallback can't help because
// there's nothing left to signal. A keeper stuck here stops deploying AND stops
// restarting crashes, while still looking alive — the worst way to fail. So:
// return immediately if it's already dead, and cap the wait either way.
async function stopChild() {
  const c = child;
  if (!c || c.exitCode !== null || c.signalCode !== null) return;
  await new Promise((r) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(hardKill);
      clearTimeout(giveUp);
      r();
    };
    c.once('exit', finish);
    try { c.kill('SIGTERM'); } catch { finish(); }
    const hardKill = setTimeout(() => { try { c.kill('SIGKILL'); } catch {} }, 8000);
    const giveUp = setTimeout(finish, 12_000);
  });
}

// A locally-modified tracked file makes `git merge --ff-only` abort, and the
// keeper used to just retry that same aborting merge every poll, forever —
// so one stray edit on the venue laptop meant the venue could never take a
// deploy again, and if that edit also broke the app, the app crash-looped
// with no way out but a human at a keyboard. Nothing on this machine is
// meant to be hand-edited, so the modification is always the thing to drop —
// but it gets copied aside first, because "the keeper silently deleted my
// work" is not a thing this should ever be able to do.
async function preserveAndClean(reason) {
  // `git diff --name-only -z HEAD`, not `git status --porcelain`: porcelain
  // encodes the status in two leading columns, and the git() helper trims its
  // output, which eats the leading space off the first line and shifts every
  // path on it by one character. This form emits bare NUL-separated paths —
  // no columns to mis-slice, no shell quoting of odd filenames — and it lists
  // only TRACKED changes, so untracked files never even come up.
  let raw = '';
  try { raw = await git(['diff', '--name-only', '-z', 'HEAD']); } catch { return false; }
  const paths = raw.split('\0').map((p) => p.trim()).filter(Boolean);
  if (!paths.length) return false;

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = resolve(CWD, 'data', `clobbered-${stamp}`);
  let saved = 0;
  for (const rel of paths) {
    try {
      const from = resolve(REPO_ROOT, rel);
      if (!existsSync(from)) continue;         // deleted locally — git restores it below
      const to = join(backup, rel);
      mkdirSync(dirname(to), { recursive: true });
      copyFileSync(from, to);
      saved += 1;
    } catch { /* a file we can't copy is still a file we must not be blocked by */ }
  }
  // `reset --hard HEAD` rather than `checkout -- .` so a staged change is
  // cleared too, and rather than `git stash` because stash writes a commit,
  // which needs a configured user.email/user.name. A venue laptop may not have
  // one, and a keeper that can only rescue itself on a correctly-configured
  // machine is no rescue. Untracked and ignored files survive all of this.
  try { await git(['reset', '--hard', 'HEAD']); } catch { return false; }
  await notify('tree-cleaned', `${reason}: discarded local edits to ${paths.length} tracked file(s)` +
    (saved ? `, copies kept in ${backup}` : ''));
  return true;
}

// The app can't start at all and won't stop failing. Almost always this is a
// checkout that is dirty or behind, so put it back on exactly what origin says
// and let it try again. If it's already clean and current, git has nothing
// left to offer and saying so is more use than healing in circles.
async function selfHeal() {
  try {
    const branch = process.env.KEEPER_BRANCH || (await git(['rev-parse', '--abbrev-ref', 'HEAD']));
    const cleaned = await preserveAndClean('app will not stay up');
    await git(['fetch', 'origin', `+${branch}:refs/remotes/origin/${branch}`]);
    const local = await git(['rev-parse', 'HEAD']);
    const remote = await git(['rev-parse', `origin/${branch}`]);
    if (local === remote) {
      if (!cleaned) {
        await notify('heal-exhausted',
          `checkout is clean and already on ${remote.slice(0, 7)} — the committed code itself is failing to start, so this needs a person`);
      }
      return;
    }
    await git(['reset', '--hard', `origin/${branch}`]);
    await notify('healed', `forced ${local.slice(0, 7)} -> ${remote.slice(0, 7)} on ${branch} after repeated startup crashes`);
  } catch (err) {
    await notify('heal-error', err.message);
  }
}

async function checkForDeploy() {
  // The poll interval keeps firing while a deploy is still running its test
  // suite, and two of these overlapping fight over the same checkout: one
  // merges while the other resets, one stops the app while the other starts it.
  // A deploy already in flight is reason enough to skip this tick.
  if (deploying) return;
  try {
    const branch = process.env.KEEPER_BRANCH || (await git(['rev-parse', '--abbrev-ref', 'HEAD']));
    await git(['fetch', 'origin', `+${branch}:refs/remotes/origin/${branch}`]);
    const local = await git(['rev-parse', 'HEAD']);
    const remote = await git(['rev-parse', `origin/${branch}`]);
    status.sha = local;
    status.branch = branch;
    writeStatus();
    if (local === remote) return;

    await notify('deploy-start', `${local.slice(0, 7)} -> ${remote.slice(0, 7)} on ${branch}`);
    deploying = true;
    await preserveAndClean('deploy blocked by local edits');
    await git(['merge', '--ff-only', `origin/${branch}`]);

    const test = await run(TEST_CMD, CWD);
    if (!test.ok) {
      // Print the actual failure, not just "tests failed" — that's the one
      // piece of information an operator needs to tell "the code is really
      // broken" apart from "the test command itself couldn't run" (e.g. a
      // shell/PATH/policy issue outside the test suite's control).
      console.log('[keeper] test output (last 4000 chars):');
      console.log(test.out.slice(-4000));
      await notify('deploy-rejected', `tests failed against ${remote.slice(0, 7)} (exit ${test.code}) — rolled back to ${local.slice(0, 7)}`);
      await git(['reset', '--hard', local]);
      deploying = false;
      return;
    }

    // A restart queued by an earlier crash would otherwise fire alongside the
    // one below, leaving two servers racing for the same port.
    if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
    await stopChild();
    deploying = false;
    startChild();
    status.sha = remote;
    await notify('deploy-live', `now running ${remote.slice(0, 7)}`);
  } catch (err) {
    deploying = false;
    await notify('deploy-error', err.message);
  }
}

process.on('SIGINT', async () => { await stopChild(); process.exit(0); });
process.on('SIGTERM', async () => { await stopChild(); process.exit(0); });

console.log(`[keeper] watching ${REPO_ROOT} — running "${CMD}" in ${CWD}`);
startChild();
checkForDeploy();
setInterval(checkForDeploy, POLL_MS);

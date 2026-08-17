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
//   KEEPER_NOTIFY_WEBHOOK   optional URL, POSTed on events (fire-and-forget, never blocks a deploy)
//
// This script does `git merge --ff-only` / `git reset --hard` in KEEPER_REPO_ROOT.
// Point it at a DEDICATED deploy checkout, not a directory you edit by hand.

import { spawn, execFile } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
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

const status = { pid: null, restarts: 0, sha: null, branch: null, upSince: null, lastEvent: null };
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

function startChild() {
  const [bin, ...args] = CMD.split(' ');
  child = spawn(bin, args, { cwd: CWD, stdio: 'inherit', env: process.env });
  status.pid = child.pid;
  status.upSince = new Date().toISOString();
  writeStatus();
  child.on('exit', (code, signal) => {
    if (deploying) return; // this exit was requested by us for a redeploy, not a crash
    notify('crash', `app exited (code ${code}, signal ${signal}) — restarting in ${backoffMs}ms`);
    status.restarts += 1;
    setTimeout(startChild, backoffMs);
    backoffMs = Math.min(backoffMs * 2, 30_000);
  });
  setTimeout(() => { backoffMs = 1000; }, 60_000); // stable for a minute => forget prior backoff
}

async function stopChild() {
  if (!child) return;
  await new Promise((r) => {
    child.once('exit', r);
    child.kill('SIGTERM');
    setTimeout(() => child && child.kill('SIGKILL'), 8000);
  });
}

async function checkForDeploy() {
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

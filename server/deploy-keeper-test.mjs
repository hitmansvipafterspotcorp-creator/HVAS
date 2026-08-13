// Real E2E test for deploy-keeper.mjs — no mocks. Builds two throwaway git repos
// (a bare "origin" + a working "deploy checkout"), runs the actual keeper against
// them as a real child process, and verifies:
//   1) it boots the app and the app is reachable
//   2) killing the app -9 gets it restarted automatically
//   3) a new commit that passes its tests gets deployed live
//   4) a new commit that FAILS its tests gets rejected and rolled back —
//      the app keeps serving the last good version, not the broken one
//
//   node deploy-keeper-test.mjs
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log(`  ok - ${label}`); }
  else { fail++; console.log(`  NOT OK - ${label}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const root = mkdtempSync(join(tmpdir(), 'hvas-keeper-'));
const originDir = join(root, 'origin.git');
const workDir = join(root, 'work');
const PORT = 8933;

function g(cwd, args) { return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim(); }

function appSource(version) {
  return `import http from 'node:http';
http.createServer((req, res) => { res.end(JSON.stringify({ version: '${version}' })); })
  .listen(${PORT}, () => console.log('fake app ${version} up'));
`;
}
const passingTest = `console.log('tests ok'); process.exit(0);\n`;
const failingTest = `console.log('tests broken on purpose'); process.exit(1);\n`;

function writeCommit(dir, { version, testBody, message }) {
  writeFileSync(join(dir, 'app.mjs'), appSource(version));
  writeFileSync(join(dir, 'test.mjs'), testBody);
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fake-app', type: 'module', scripts: { test: 'node test.mjs' } }, null, 2));
  g(dir, ['add', '-A']);
  g(dir, ['commit', '-m', message, '--quiet']);
  return g(dir, ['rev-parse', 'HEAD']);
}

async function fetchVersion() {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/`);
    return (await r.json()).version;
  } catch { return null; }
}
async function waitForVersion(v, timeoutMs) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if ((await fetchVersion()) === v) return true;
    await sleep(300);
  }
  return false;
}
function statusFile() { return join(workDir, 'data', 'keeper-status.json'); }
function readStatus() { try { return JSON.parse(readFileSync(statusFile(), 'utf8')); } catch { return null; } }

let keeper;
try {
  console.log('Setting up fake origin + work checkout...');
  mkdirRec(originDir); mkdirRec(workDir);
  g(originDir, ['init', '--bare', '--initial-branch=main', '--quiet']);

  const seedDir = join(root, 'seed');
  mkdirRec(seedDir);
  g(seedDir, ['init', '--initial-branch=main', '--quiet']);
  g(seedDir, ['config', 'user.email', 'keeper-test@local']);
  g(seedDir, ['config', 'user.name', 'Keeper Test']);
  writeCommit(seedDir, { version: 'v1', testBody: passingTest, message: 'v1' });
  g(seedDir, ['remote', 'add', 'origin', originDir]);
  g(seedDir, ['push', 'origin', 'main', '--quiet']);

  g(workDir, ['clone', originDir, '.', '--quiet']);
  g(workDir, ['config', 'user.email', 'keeper-test@local']);
  g(workDir, ['config', 'user.name', 'Keeper Test']);

  console.log('\n1) BOOT + CRASH RECOVERY');
  keeper = spawn('node', [resolve(__dirname, 'deploy-keeper.mjs')], {
    cwd: workDir,
    env: {
      ...process.env,
      KEEPER_CMD: 'node app.mjs',
      KEEPER_CWD: workDir,
      KEEPER_REPO_ROOT: workDir,
      KEEPER_BRANCH: 'main',
      KEEPER_TEST_CMD: 'npm test',
      KEEPER_POLL_SECONDS: '2',
      PORT: String(PORT),
    },
    stdio: 'pipe',
  });
  keeper.stdout.on('data', (d) => process.stdout.write(`  [keeper] ${d}`));
  keeper.stderr.on('data', (d) => process.stdout.write(`  [keeper:err] ${d}`));

  ok(await waitForVersion('v1', 8000), 'keeper boots the app and it serves v1');

  const st1 = readStatus();
  ok(!!st1 && !!st1.pid, 'keeper wrote a status file with a pid');
  if (st1?.pid) {
    try { process.kill(st1.pid, 'SIGKILL'); } catch {}
  }
  ok(await waitForVersion('v1', 8000), 'app comes back on its own after being killed -9');
  const st2 = readStatus();
  ok(st2 && st2.restarts >= 1, 'keeper recorded the crash restart');

  console.log('\n2) GOOD DEPLOY — new commit that passes tests goes live');
  writeCommit(seedDir, { version: 'v2', testBody: passingTest, message: 'v2 good' });
  g(seedDir, ['push', 'origin', 'main', '--quiet']);
  ok(await waitForVersion('v2', 15000), 'app is serving v2 after the keeper picks up the good commit');
  ok(g(workDir, ['rev-parse', 'HEAD']) === g(seedDir, ['rev-parse', 'HEAD']), 'work checkout HEAD matches the deployed commit');

  console.log('\n3) BAD DEPLOY — new commit that FAILS tests is rejected');
  const goodSha = g(seedDir, ['rev-parse', 'HEAD']);
  writeCommit(seedDir, { version: 'v3', testBody: failingTest, message: 'v3 broken' });
  g(seedDir, ['push', 'origin', 'main', '--quiet']);
  await sleep(6000); // give the keeper a couple of poll cycles to see + reject it
  ok((await fetchVersion()) === 'v2', 'app is STILL serving v2, not the broken v3');
  ok(g(workDir, ['rev-parse', 'HEAD']) === goodSha, 'work checkout rolled back to the last good commit, not left on the broken one');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
} finally {
  if (keeper) { try { process.kill(-keeper.pid); } catch {} try { keeper.kill('SIGKILL'); } catch {} }
  try { execFileSync('pkill', ['-f', `node app.mjs`], { stdio: 'ignore' }); } catch {}
  try { rmSync(root, { recursive: true, force: true }); } catch {}
}

function mkdirRec(p) { execFileSync('mkdir', ['-p', p]); }

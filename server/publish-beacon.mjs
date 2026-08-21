// Put this venue on the map.
//
//   node publish-beacon.mjs https://your-current-public-url
//
// A tunnel address is disposable. This venue's id is not — it was generated
// once, lives in the venue's own database, and never changes. The directory
// this writes says "venue <id> is reachable at <url> right now", and the app
// reads it from its own permanent address.
//
// The upshot for the room: a member who joined once never needs a link again.
// When the address moves, their app looks the venue up by id and reconnects
// itself. That is the part a domain cannot do — a domain still points at one
// machine, and still dies the day it is not renewed.
//
// Run this whenever the public address changes (every restart, on a quick
// tunnel). With a named tunnel the address is already stable and this only
// needs running once.
import { execFile as _execFile } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';


const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..');
// The directory members actually read is the one on the PUBLISHED branch —
// the source copy never reaches a phone until somebody rebuilds the site. And a
// venue laptop keeps a narrow checkout (it has no reason to hold the app or its
// art), so the file is not even on disk here.
//
// So this writes the published branch directly, with git plumbing and no
// checkout: hash a blob, graft it onto that branch's tree, push the commit. No
// working copy, no second clone, nothing for the venue to keep in sync.
const BRANCH = process.env.HVAS_PAGES_BRANCH || 'gh-pages';
const FILE = 'venues.json';
const LOCAL = process.env.HVAS_LOCAL || 'http://localhost:8787';

const url = (process.argv[2] || '').trim().replace(/\/+$/, '');
if (!url || !/^https?:\/\//.test(url)) {
  console.log('Usage: node publish-beacon.mjs https://your-public-url');
  console.log('\nThat is the address from the tunnel window — the line under "YOU\'RE LIVE".');
  process.exit(1);
}
// The usage line above is easy to paste verbatim, and "that address is not
// answering" is a baffling thing to be told when you have copied exactly what
// you were shown. Name the mistake instead.
if (/your-current-tunnel-url|your-public-url|example\.com|REPLACE/i.test(url)) {
  console.log('That is the example, not your link.');
  console.log('\nYour link is in the tunnel window, on the line under "YOU\'RE LIVE" —');
  console.log('it looks like https://three-random-words-here.trycloudflare.com');
  console.log('and it changes every time you restart, unless you set up a named tunnel.');
  process.exit(1);
}

// Ask the venue who it is. The id has to come from the running backend rather
// than be invented here, or the directory would point at a venue that does not
// think it is that venue.
let beacon;
try {
  const r = await fetch(`${LOCAL}/beacon`, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`the venue answered ${r.status}`);
  beacon = await r.json();
} catch (e) {
  console.log(`Could not reach the venue at ${LOCAL} — is the HVAS Server window open?`);
  console.log(`(${e.message})`);
  process.exit(1);
}

// And check the public address actually reaches the SAME venue, so a stale or
// mistyped tunnel URL cannot put someone else's room under this venue's name.
try {
  const r = await fetch(`${url}/config`, { signal: AbortSignal.timeout(12000) });
  const cfg = await r.json();
  if (!r.ok) throw new Error(`that address answered ${r.status}`);
  if (cfg.venueId && cfg.venueId !== beacon.venueId) {
    console.log('That public address belongs to a different venue — not publishing it.');
    process.exit(1);
  }
} catch (e) {
  console.log(`That address is not answering yet: ${e.message}`);
  console.log('Wait for the tunnel to say it is reachable, then run this again.');
  process.exit(1);
}

const git = (args, env) => new Promise((res) => _execFile('git', ['-C', REPO, ...args],
  { env: { ...process.env, ...(env || {}) }, maxBuffer: 8 * 1024 * 1024 },
  (err, out, errOut) => res({ ok: !err, out: (out || '').trim(), err: (errOut || '').trim() })));

const entry = {
  venueId: beacon.venueId,
  name: beacon.name,
  url,
  city: process.env.HVAS_VENUE_CITY || '',
  updatedAt: Date.now(),
};

const fetched = await git(['fetch', 'origin', `${BRANCH}:refs/remotes/origin/${BRANCH}`, '--force']);
if (!fetched.ok) {
  console.log(`Could not reach the published site branch (${BRANCH}): ${fetched.err.split('\n')[0]}`);
  process.exit(1);
}

// Whatever is published now, so other venues in the list are preserved.
let dir = { venues: [] };
const existing = await git(['show', `origin/${BRANCH}:${FILE}`]);
if (existing.ok) { try { dir = JSON.parse(existing.out); } catch { /* replace a corrupt one */ } }
if (!Array.isArray(dir.venues)) dir.venues = [];
const i = dir.venues.findIndex((v) => v.venueId === entry.venueId);
if (i >= 0) dir.venues[i] = { ...dir.venues[i], ...entry }; else dir.venues.push(entry);
dir.updatedAt = Date.now();

console.log(`\n  ${entry.name}`);
console.log(`  id   ${entry.venueId}   (permanent — this never changes)`);
console.log(`  now  ${entry.url}`);
console.log(`       (disposable — this is the part that moves)`);

// blob -> tree -> commit -> push, all without a working copy.
const blob = await new Promise((res) => {
  const c = _execFile('git', ['-C', REPO, 'hash-object', '-w', '--stdin'], (e, o) => res(e ? null : o.trim()));
  c.stdin.end(`${JSON.stringify(dir, null, 2)}\n`);
});
if (!blob) { console.log('\nCould not stage the directory entry.'); process.exit(1); }

const idx = resolve(REPO, '.git', `beacon-index-${process.pid}`);
const env = { GIT_INDEX_FILE: idx };
const read = await git(['read-tree', `origin/${BRANCH}`], env);
if (!read.ok) { console.log(`\nCould not read the published branch: ${read.err.split('\n')[0]}`); process.exit(1); }
await git(['update-index', '--add', '--cacheinfo', `100644,${blob},${FILE}`], env);
const tree = await git(['write-tree'], env);
if (!tree.ok) { console.log('\nCould not build the update.'); process.exit(1); }
const commit = await git(['commit-tree', tree.out, '-p', `origin/${BRANCH}`,
  '-m', `Venue ${entry.venueId} is now at ${entry.url}`]);
if (!commit.ok) { console.log('\nCould not record the update.'); process.exit(1); }

const push = await git(['push', 'origin', `${commit.out}:refs/heads/${BRANCH}`]);
console.log(push.ok
  ? `\nPublished to ${BRANCH}. Anyone who has joined this room before reconnects on their own,\nand it now shows in the rooms list for everyone else.`
  : `\nNot published: ${(push.err || push.out).split('\n')[0]}\nThe link above still works — share it directly for tonight.`);

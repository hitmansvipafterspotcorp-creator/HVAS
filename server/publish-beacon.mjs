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
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..');
const DIRECTORY = resolve(REPO, 'hitmans_vip_membership_app', 'public', 'venues.json');
const LOCAL = process.env.HVAS_LOCAL || 'http://localhost:8787';

const url = (process.argv[2] || '').trim().replace(/\/+$/, '');
if (!url || !/^https?:\/\//.test(url)) {
  console.log('Usage: node publish-beacon.mjs https://your-public-url');
  console.log('\nThat is the address from the tunnel window — the line under "YOU\'RE LIVE".');
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

if (!existsSync(dirname(DIRECTORY))) mkdirSync(dirname(DIRECTORY), { recursive: true });
let dir = { venues: [] };
try { dir = JSON.parse(readFileSync(DIRECTORY, 'utf8')); } catch { /* first publish */ }
if (!Array.isArray(dir.venues)) dir.venues = [];

const entry = {
  venueId: beacon.venueId,
  name: beacon.name,
  url,
  city: process.env.HVAS_VENUE_CITY || '',
  updatedAt: Date.now(),
};
const i = dir.venues.findIndex((v) => v.venueId === entry.venueId);
if (i >= 0) dir.venues[i] = { ...dir.venues[i], ...entry }; else dir.venues.push(entry);
dir.updatedAt = Date.now();
writeFileSync(DIRECTORY, `${JSON.stringify(dir, null, 2)}\n`);

console.log(`\n  ${entry.name}`);
console.log(`  id   ${entry.venueId}   (permanent — this never changes)`);
console.log(`  now  ${entry.url}       (disposable — this is what moves)`);
console.log(`\nWrote ${DIRECTORY}`);

// Publishing it is a git push: the directory is served from the app's own
// address, which is already permanent and free. Nothing here fails the venue's
// night — if the push does not go through, the file is written and can be
// pushed by hand.
const git = (args) => new Promise((res) => execFile('git', ['-C', REPO, ...args], (err, out, errOut) => res({ ok: !err, out: (out || errOut || '').trim() })));
const branch = (await git(['rev-parse', '--abbrev-ref', 'HEAD'])).out || 'main';
const add = await git(['add', DIRECTORY]);
if (!add.ok) { console.log('\nCould not stage it — commit and push venues.json yourself.'); process.exit(0); }
const commit = await git(['commit', '-m', `Venue ${entry.venueId} is now at ${entry.url}`]);
if (!commit.ok && !/nothing to commit/i.test(commit.out)) {
  console.log(`\nCould not commit: ${commit.out.split('\n')[0]}`);
  process.exit(0);
}
const push = await git(['push', 'origin', branch]);
console.log(push.ok
  ? `\nPublished. Anyone who has joined this room before will reconnect on their own.`
  : `\nWritten but not pushed (${push.out.split('\n')[0]}).\nPush ${branch} when you can — until then the old address stands.`);

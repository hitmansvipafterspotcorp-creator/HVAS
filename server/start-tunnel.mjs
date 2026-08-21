// Starts a Cloudflare quick tunnel pointed at the local HVAS backend, waits
// for the public URL cloudflared prints, then opens the app already
// connected to it (via ?connect=) so there's nothing to copy-paste by hand.
// Zero dependencies, matches the rest of this backend.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import path from 'node:path';

const PORT = process.env.HVAS_PORT || 8787;
const APP_URL = process.env.HVAS_APP_URL || 'https://hitmansvipafterspotcorp-creator.github.io/HVAS/';

function findCloudflared() {
  const explicit = process.env.CLOUDFLARED_PATH;
  if (explicit && existsSync(explicit)) return explicit;
  const nearHome = path.join(homedir(), 'cloudflared.exe');
  if (existsSync(nearHome)) return nearHome;
  // Not found at the usual spot — fall back to PATH and let the OS resolve it
  // (works for Mac/Linux installs, or if it's been added to PATH manually).
  return process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
}

const bin = findCloudflared();

// A quick tunnel gets a NEW random address every single run. That is fine for
// trying this out and useless for a game people play from other cities: the
// link you gave someone last week is dead, and so is the QR on the flyer.
//
// So if a named tunnel has been set up (cloudflared/config.yml), use it — that
// address is yours and never changes. Otherwise fall back to a quick tunnel and
// say plainly what that means, rather than printing a link that looks permanent.
const CONFIG = path.join(path.dirname(fileURLToPath(import.meta.url)), 'cloudflared', 'config.yml');
const named = existsSync(CONFIG);

// The hostname out of the config, so the launcher can print the real address
// instead of waiting for cloudflared to mention it (a named tunnel does not
// announce a URL the way a quick tunnel does).
const namedHostname = () => {
  try {
    const m = readFileSync(CONFIG, 'utf8').match(/^\s*-?\s*hostname:\s*([^\s#]+)/m);
    return m && !/REPLACE-WITH/i.test(m[1]) ? m[1] : null;
  } catch { return null; }
};

const args = named
  ? ['tunnel', '--config', CONFIG, 'run']
  : ['tunnel', '--url', `http://localhost:${PORT}`];
console.log(named
  ? `Starting your named Cloudflare Tunnel (${bin}) -> http://localhost:${PORT} ...\n`
  : `Starting a QUICK Cloudflare Tunnel (${bin}) -> http://localhost:${PORT} ...\n`);

const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });

child.on('error', (e) => {
  console.log(`\nCouldn't start cloudflared: ${e.message}`);
  console.log(`Looked for it at: ${bin}`);
  console.log('If it\'s somewhere else, set CLOUDFLARED_PATH to its full path and try again.');
});


// Tell the room directory where this venue is now. Runs the same script a host
// would run by hand; failure here never affects the night, so it reports and
// moves on rather than throwing.
function publishBeacon(publicUrl) {
  const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'publish-beacon.mjs');
  if (!existsSync(script)) return;
  const child = spawn(process.execPath, [script, publicUrl], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => (out += d));
  child.stderr.on('data', (d) => (out += d));
  child.on('error', () => console.log('(Could not update the room directory — the link above still works.)'));
  child.on('close', () => {
    const line = out.split('\n').find((l) => /Published|not pushed|Wrote/.test(l));
    console.log(line ? `\n[rooms] ${line.trim()}` : '\n[rooms] directory not updated — the link above still works.');
  });
}

function openBrowser(url) {
  const opener = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const openerArgs = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  // This is a nice-to-have, not the tunnel itself — if the browser doesn't
  // auto-open for any reason (no default browser set, unusual PATH), the
  // tunnel that needs to stay up all night must never go down because of it.
  const opened = spawn(opener, openerArgs, { shell: false, stdio: 'ignore', detached: true });
  opened.on('error', () => console.log(`(Couldn't auto-open the browser — just open the link above manually.)`));
  opened.unref();
}

// cloudflared prints the URL the moment the tunnel is *registered*, not the
// moment it's actually routing traffic end-to-end (cloudflared's own message
// says so: "it may take some time to be reachable") — opening the browser
// immediately raced that gap and landed on the app's "can't reach" screen.
// Poll the real URL until it actually answers before opening anything.
// Two completely different things can leave the public link silent, and they
// need opposite responses: the backend is not running (open the server window),
// or the tunnel has not finished routing yet (wait). Check both so the message
// at the end can say which — the old one just said the network was unsettled,
// which sends somebody to fiddle with their wifi when their server is down.
async function waitUntilReachable(url, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  let local = false, lastPublic = '';
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://localhost:${PORT}/config`, { signal: AbortSignal.timeout(2500) });
      local = r.ok;
    } catch { local = false; }
    try {
      const r = await fetch(`${url}/config`, { signal: AbortSignal.timeout(4000) });
      if (r.ok) return { ok: true };
      lastPublic = `answered ${r.status}`;          // 502 = tunnel up, nothing behind it yet
    } catch (e) { lastPublic = e.name === 'TimeoutError' ? 'timed out' : 'no answer'; }
    await new Promise((res) => setTimeout(res, 1500));
  }
  return { ok: false, local, lastPublic };
}

let found = false;
const announce = (url, permanent) => {
  found = true;

  const connectUrl2 = `${APP_URL}?connect=${encodeURIComponent(url)}`;
  console.log('\n==================================================');
  console.log("  YOU'RE LIVE");
  console.log(`  Public link:  ${url}`);
  console.log(permanent
    ? '  This address is yours — it stays the same every night.'
    : '  TEMPORARY link — a NEW one every restart. Anyone you gave');
  if (!permanent) console.log('  the old link to is cut off. See SELF_HOST.md to make it permanent.');
  console.log('==================================================\n');
  console.log('Confirming the tunnel is actually reachable before opening the app...');
  waitUntilReachable(url).then((ready) => {
    if (!ready.ok) {
      console.log('\n--------------------------------------------------');
      if (!ready.local) {
        console.log('  THE SERVER IS NOT ANSWERING');
        console.log(`  Nothing is running on http://localhost:${PORT}, so the tunnel has`);
        console.log('  nothing to point at. Check the OTHER window (HVAS Server) —');
        console.log('  it may have closed or failed to start. Start it, then run this again.');
      } else {
        console.log('  THE SERVER IS FINE — THE LINK IS STILL ROUTING');
        console.log(`  http://localhost:${PORT} is answering, so the venue itself is up.`);
        console.log(`  The public link ${ready.lastPublic} for the last minute; quick tunnels`);
        console.log('  sometimes take a while to propagate. The link above is real —');
        console.log('  try opening it in a browser. If it works, you are live.');
      }
      console.log('--------------------------------------------------\n');
      return;
    }
    console.log('Confirmed reachable. Opening the app now, already connected to this venue...');
    openBrowser(connectUrl2);
    // Put the room on the map without anyone having to remember to. The link
    // moves every restart on a quick tunnel, and the whole point of the venue
    // having a permanent id is that members should never chase it — but only
    // if something actually publishes where it moved to.
    publishBeacon(url);
    console.log('\nOnce it opens, go to My Pass -> "Show join QR" to share with everyone else tonight.');
    console.log('Keep this window AND the HVAS Server window open all night.\n');
  });
};

const onData = (buf) => {
  const text = buf.toString();
  process.stdout.write(text);          // keep showing cloudflared's own output too
  if (found || named) return;
  const m = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
  if (m) announce(m[0], false);
};
child.stdout.on('data', onData);
child.stderr.on('data', onData);

// A named tunnel routes to a hostname you already own, so there is no URL to
// scrape out of the log — announce it as soon as the process is up.
if (named) {
  const host = namedHostname();
  if (host) setTimeout(() => announce(`https://${host}`, true), 1500);
  else {
    console.log('\ncloudflared/config.yml is there but its hostname is still the placeholder.');
    console.log('Fill it in (see SELF_HOST.md) or delete the file to fall back to a quick tunnel.\n');
  }
}
child.on('exit', (code) => console.log(`\ncloudflared exited (code ${code}).`));

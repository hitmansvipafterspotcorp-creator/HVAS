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
async function waitUntilReachable(url, timeoutMs = 25000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${url}/config`, { signal: AbortSignal.timeout(3000) });
      if (r.ok) return true;
    } catch { /* not ready yet — keep trying */ }
    await new Promise((res) => setTimeout(res, 1000));
  }
  return false;
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
    if (!ready) {
      console.log('\nStill not answering after 25s. The link above is real and may just need');
      console.log('more time — open it manually, or run this again once the venue wifi/network');
      console.log('settles down.\n');
      return;
    }
    console.log('Confirmed reachable. Opening the app now, already connected to this venue...');
    openBrowser(connectUrl2);
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

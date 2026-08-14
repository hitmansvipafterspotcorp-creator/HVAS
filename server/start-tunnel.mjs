// Starts a Cloudflare quick tunnel pointed at the local HVAS backend, waits
// for the public URL cloudflared prints, then opens the app already
// connected to it (via ?connect=) so there's nothing to copy-paste by hand.
// Zero dependencies, matches the rest of this backend.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
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
console.log(`Starting Cloudflare Tunnel (${bin}) -> http://localhost:${PORT} ...\n`);

const child = spawn(bin, ['tunnel', '--url', `http://localhost:${PORT}`], { stdio: ['ignore', 'pipe', 'pipe'] });

child.on('error', (e) => {
  console.log(`\nCouldn't start cloudflared: ${e.message}`);
  console.log(`Looked for it at: ${bin}`);
  console.log('If it\'s somewhere else, set CLOUDFLARED_PATH to its full path and try again.');
});

let found = false;
const onData = (buf) => {
  const text = buf.toString();
  process.stdout.write(text); // keep showing cloudflared's own output too
  if (found) return;
  const m = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
  if (!m) return;
  found = true;
  const url = m[0];
  const connectUrl = `${APP_URL}?connect=${encodeURIComponent(url)}`;
  console.log('\n==================================================');
  console.log("  YOU'RE LIVE");
  console.log(`  Public link:  ${url}`);
  console.log('==================================================\n');
  console.log('Opening the app now, already connected to this venue...');
  const opener = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const openerArgs = process.platform === 'win32' ? ['/c', 'start', '', connectUrl] : [connectUrl];
  // This is a nice-to-have, not the tunnel itself — if the browser doesn't
  // auto-open for any reason (no default browser set, unusual PATH), the
  // tunnel that needs to stay up all night must never go down because of it.
  const opened = spawn(opener, openerArgs, { shell: false, stdio: 'ignore', detached: true });
  opened.on('error', () => console.log(`(Couldn't auto-open the browser — just open the link above manually.)`));
  opened.unref();
  console.log('\nOnce it opens, go to My Pass -> "Show join QR" to share with everyone else tonight.');
  console.log('Keep this window AND the HVAS Server window open all night.\n');
};
child.stdout.on('data', onData);
child.stderr.on('data', onData);
child.on('exit', (code) => console.log(`\ncloudflared exited (code ${code}).`));

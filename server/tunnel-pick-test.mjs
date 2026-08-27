// Which public address does the launcher choose, and does it prefer the
// permanent one? Exercised with fake CLIs so it runs anywhere.
// Runs with fake CLIs, so it needs neither Tailscale nor cloudflared installed.
import { mkdirSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
const BIN = '/tmp/fakebin'; rmSync(BIN, {recursive:true, force:true}); mkdirSync(BIN, {recursive:true});
const fake = (name, body) => { const p = `${BIN}/${name}`; writeFileSync(p, `#!/bin/sh\n${body}\n`); chmodSync(p, 0o755); return p; };
let pass=0, fail=0; const ok=(c,m)=>{if(c){pass++;console.log('  ✓',m);}else{fail++;console.log('  ✗',m);}};

const run = (env) => new Promise((res) => {
  const c = spawn(process.execPath, [new URL('./start-tunnel.mjs', import.meta.url).pathname],
    { env: { ...process.env, ...env }, stdio: ['ignore','pipe','pipe'] });
  let out=''; c.stdout.on('data',d=>out+=d); c.stderr.on('data',d=>out+=d);
  setTimeout(()=>{ c.kill(); res(out); }, 3000);
});

console.log('FUNNEL AVAILABLE -> USE THE PERMANENT ADDRESS');
fake('tailscale', 'if [ "$1" = "status" ]; then echo \'{"Self":{"DNSName":"dabiggest.tail1234.ts.net."}}\'; exit 0; fi; exit 0');
fake('cloudflared', 'echo "https://random-words.trycloudflare.com"; sleep 30');
let out = await run({ TAILSCALE_PATH: `${BIN}/tailscale`, CLOUDFLARED_PATH: `${BIN}/cloudflared`, HVAS_PORT: '8787' });
ok(/dabiggest\.tail1234\.ts\.net/.test(out), 'announces the Tailscale address');
ok(/stays the same every night/i.test(out), 'and says it is permanent');
ok(!/trycloudflare/.test(out), 'and does not fall back to a disposable Cloudflare link');

console.log('\nFUNNEL ADDRESS BUT FUNNEL SWITCHED OFF -> SAY NOBODY CAN REACH YOU');
// The failure this exists to make impossible. From the venue's own machine a
// .ts.net address answers over the tailnet whether or not Funnel is on, so the
// reachability check passes and the screen says YOU'RE LIVE — while every
// person who scans the poster from their own phone gets nothing.
fake('tailscale', `
if [ "$1" = "status" ]; then echo '{"Self":{"DNSName":"dabiggest.tail1234.ts.net."}}'; exit 0; fi
if [ "$1" = "serve" ]; then echo '{"AllowFunnel":{}}'; exit 0; fi
exit 0`);
out = await run({ TAILSCALE_PATH: `${BIN}/tailscale`, CLOUDFLARED_PATH: `${BIN}/cloudflared`, HVAS_PORT: '8787' });
ok(/NOBODY OUTSIDE CAN REACH YOU/i.test(out), 'it says outright that nobody outside can reach the venue');
ok(/only works for your own devices/i.test(out), 'and why — the address is tailnet-only');
ok(/tailscale funnel --bg 8787/.test(out), 'with the exact command that fixes it');
ok(/WIFI OFF/i.test(out), 'and the only test that actually proves it is fixed');

console.log('\nFUNNEL ON -> SAY SO, AND DO NOT NAG');
fake('tailscale', `
if [ "$1" = "status" ]; then echo '{"Self":{"DNSName":"dabiggest.tail1234.ts.net."}}'; exit 0; fi
if [ "$1" = "serve" ]; then echo '{"AllowFunnel":{"dabiggest.tail1234.ts.net:443":true},"Web":{"dabiggest.tail1234.ts.net:443":{"Handlers":{"/":{"Proxy":"http://127.0.0.1:8787"}}}}}'; exit 0; fi
exit 0`);
out = await run({ TAILSCALE_PATH: `${BIN}/tailscale`, CLOUDFLARED_PATH: `${BIN}/cloudflared`, HVAS_PORT: '8787' });
ok(/Funnel is serving this publicly/i.test(out), 'a venue that IS published is told so');
ok(!/NOBODY OUTSIDE CAN REACH YOU/i.test(out), 'and is not warned about a problem it does not have');

console.log('\nFUNNEL UNKNOWABLE -> CLAIM NOTHING');
// Tailscale not answering is not evidence of success. Saying "could not
// confirm" is worth more than a confident wrong answer.
fake('tailscale', `
if [ "$1" = "status" ]; then echo '{"Self":{"DNSName":"dabiggest.tail1234.ts.net."}}'; exit 0; fi
if [ "$1" = "serve" ]; then echo 'not json at all'; exit 0; fi
exit 0`);
out = await run({ TAILSCALE_PATH: `${BIN}/tailscale`, CLOUDFLARED_PATH: `${BIN}/cloudflared`, HVAS_PORT: '8787' });
ok(/could not confirm/i.test(out), 'an unreadable answer is reported as unconfirmed');
ok(/WIFI OFF/i.test(out), 'and falls back to telling them how to check for themselves');

console.log('\nFUNNEL BLOCKED -> SAY WHY, THEN FALL BACK');
fake('tailscale', 'if [ "$1" = "status" ]; then echo \'{"Self":{"DNSName":"dabiggest.tail1234.ts.net."}}\'; exit 0; fi; echo "Funnel is not enabled for this tailnet" >&2; exit 1');
out = await run({ TAILSCALE_PATH: `${BIN}/tailscale`, CLOUDFLARED_PATH: `${BIN}/cloudflared`, HVAS_PORT: '8787' });
ok(/Funnel would not start/i.test(out), 'explains that Funnel did not start');
ok(/Access controls/i.test(out), 'and points at the setting that fixes it');
ok(/trycloudflare/.test(out), 'then falls back so the night still happens');

console.log('\nNO TAILSCALE -> QUICK TUNNEL, UNCHANGED');
out = await run({ TAILSCALE_PATH: `${BIN}/nope`, CLOUDFLARED_PATH: `${BIN}/cloudflared`, HVAS_PORT: '8787' });
ok(/trycloudflare/.test(out), 'uses the Cloudflare quick tunnel');
ok(/TEMPORARY/i.test(out), 'and warns that the link is temporary');

console.log(`\n${pass} passed, ${fail} failed`);
rmSync(BIN,{recursive:true,force:true});
process.exit(fail?1:0);

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

// The venue serving the app itself, so a phone on the venue wifi needs no
// tunnel, no Cloudflare and no internet — it opens the laptop's address and
// gets the app and the backend from one origin, which is what stops the
// browser blocking the calls as mixed content.
import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs';
const APP = '/tmp/venue-app';
rmSync(APP, { recursive: true, force: true }); mkdirSync(APP, { recursive: true });
const SRC = process.env.HVAS_TEST_APP || '/tmp/ghp-stage';
if (!existsSync(SRC)) { console.log(`(skipped: no built app at ${SRC})`); process.exit(0); }
cpSync(SRC, APP, { recursive: true });
process.env.HVAS_APP_DIR = APP;
const { createApp } = await import('./src/app.mjs');
const { server } = createApp({ dataDir: `/tmp/hvas-ls-${Date.now()}` });
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
let pass=0, fail=0; const ok=(c,m)=>{if(c){pass++;console.log('  ✓',m);}else{fail++;console.log('  ✗',m);}};

console.log('THE VENUE SERVES THE APP');
const root = await fetch(base + '/', { redirect: 'manual' });
ok(root.status === 302 && root.headers.get('location') === '/HVAS/', 'the bare address redirects to the app');
const page = await fetch(base + '/HVAS/');
const html = await page.text();
ok(page.ok, 'the app loads from the venue');
ok(/__HVAS_VENUE__/.test(html), 'and is told which venue served it, so it connects with nothing typed');
const js = html.match(/src="([^"]+\.js)"/)?.[1];
ok(!!js, `the bundle is referenced (${js})`);
const asset = await fetch(base + js);
ok(asset.ok && (asset.headers.get('content-type')||'').includes('javascript'), 'and served with the right type');
const api = await fetch(base + '/config');
ok(api.ok && (await api.json()).venueId, 'the API still answers on the same origin');
console.log('\nGUARDS');
const climb = await fetch(base + '/HVAS/../../../etc/passwd');
ok(climb.status !== 200 || !(await climb.text()).includes('root:'), 'a request cannot climb out of the app folder');
const spa = await fetch(base + '/HVAS/some/deep/route');
ok(spa.ok && (await spa.text()).includes('<html'), 'unknown app routes fall back to the app, not a 404');
console.log(`\n${pass} passed, ${fail} failed`);
server.close(); process.exit(fail?1:0);

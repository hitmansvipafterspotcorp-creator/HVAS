// The venue's internet drops. The laptop in the room is fine, the room's wifi
// is fine, the round is still running — can a member still load the app and
// play? Modelled by serving the app and the venue on two different ports and
// then killing ONLY the one the app is served from.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const CHROME='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const APP='/home/claude/hvas/hitmans_vip_membership_app/dist';
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const web=createServer(async(q,s)=>{let p=decodeURIComponent(q.url.split('?')[0]).replace(/^\/HVAS/,'')||'/';if(p==='/'||!extname(p))p='/index.html';
  try{const b=await readFile(join(APP,normalize(p)));s.writeHead(200,{'Content-Type':T[extname(p)]||'application/octet-stream'});s.end(b);}
  catch{try{const b=await readFile(join('/home/claude/hvas',normalize(p)));s.writeHead(200,{'Content-Type':T[extname(p)]||'application/octet-stream'});s.end(b);}catch{s.writeHead(404).end('no');}}});
await new Promise(r=>web.listen(0,r));
const appPort=web.address().port;
const appUrl=`http://127.0.0.1:${appPort}/HVAS/`;

process.env.HVAS_HOST_CODE='HOST850';
const { createApp } = await import('/home/claude/hvas/server/src/app.mjs');
const { onboard } = await import('/home/claude/hvas/server/test-helpers.mjs');
const venue = createApp({ dataDir:`/tmp/hvas-off-${Date.now()}` });
await new Promise(r=>venue.server.listen(0,r));
const api=`http://127.0.0.1:${venue.server.address().port}`;
const call=async(m,p,b,t)=>{const r=await fetch(api+p,{method:m,headers:{'Content-Type':'application/json',...(t?{Authorization:`Bearer ${t}`}:{})},body:b?JSON.stringify(b):undefined});return{status:r.status,body:await r.json().catch(()=>({}))};};
const mk=async(ph,nm)=>{const s=await call('POST','/auth/member/start',{contact:ph});
  const v=(await call('POST','/auth/member/verify',{contact:ph,code:s.body.devCode,name:nm})).body;
  await onboard(call, v.token);   // signing in is not membership
  return v;};
const host=(await call('POST','/auth/staff',{code:'HOST850'})).body.token;
const A=await mk('850-980-0001','Ayo'); await call('POST','/bingo/join',{},A.token); await call('POST','/bingo/ready',{ready:true},A.token);
const B=await mk('850-980-0002','Bree'); await call('POST','/bingo/join',{},B.token); await call('POST','/bingo/ready',{ready:true},B.token);
await call('POST','/bingo/start',{},host);

const chrome=spawn(CHROME,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--remote-debugging-port=9390',
  `--user-data-dir=/tmp/cdp-off-${Date.now()}`,'--window-size=932,430','--disable-background-timer-throttling',
  '--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows','about:blank'],{stdio:'ignore'});
let wsUrl=null;
for(let i=0;i<60;i++){try{const l=await(await fetch('http://127.0.0.1:9390/json/list')).json();const p=l.find(t=>t.type==='page');if(p?.webSocketDebuggerUrl){wsUrl=p.webSocketDebuggerUrl;break;}}catch{}await new Promise(r=>setTimeout(r,300));}
const ws=new WebSocket(wsUrl);
await new Promise((r,j)=>{ws.addEventListener('open',r);ws.addEventListener('error',j);});
let id=0;const w=new Map();
ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&w.has(m.id)){w.get(m.id)(m);w.delete(m.id);}});
const cdp=(m,p={})=>new Promise(res=>{const i=++id;w.set(i,res);ws.send(JSON.stringify({id:i,method:m,params:p}));});
const js=async e=>{const r=await cdp('Runtime.evaluate',{expression:`(()=>{${e}})()`,returnByValue:true,awaitPromise:true});return r.result?.result?.value;};
const jsA=async e=>{const r=await cdp('Runtime.evaluate',{expression:`(async()=>{${e}})()`,returnByValue:true,awaitPromise:true});return r.result?.result?.value;};
const settle=ms=>new Promise(r=>setTimeout(r,ms));
const text=async()=>(await js('return document.body?document.body.innerText:""'))||'';
let pass=0,fail=0;const ok=(c,m)=>{if(c){pass++;console.log('  ✓',m);}else{fail++;console.log('  ✗',m);}};

console.log('A NORMAL NIGHT FIRST');
await cdp('Page.navigate',{url:appUrl}); await settle(3000);
await js(`localStorage.setItem('hvas_hub_off','1');localStorage.removeItem('hvas_hub');return 1;`);
await cdp('Page.navigate',{url:`${appUrl}?connect=${encodeURIComponent(api)}`}); await settle(4500);
ok((await js(`return localStorage.getItem('hvas_api_base')`))===api, 'the member is connected to the venue');
const swReady = await jsA(`
  if (!navigator.serviceWorker) return 'unsupported';
  const r = await navigator.serviceWorker.ready.catch(()=>null);
  return r ? 'installed' : 'none';`);
ok(swReady==='installed', `the app registered its service worker (${swReady})`);
// Give it a moment to have actually cached the shell from real traffic.
await settle(2500);
const cached = await jsA(`
  const keys = await caches.keys();
  if (!keys.length) return 0;
  const c = await caches.open(keys[0]);
  return (await c.keys()).length;`);
ok(cached > 0, `the app's own files are cached for a bad night (${cached} entries)`);

console.log('\nTHE VENUE LOSES ITS INTERNET');
await new Promise(r=>web.close(r));                 // the public web is gone
const stillUp = await fetch(api+'/bingo/state').then(r=>r.ok).catch(()=>false);
ok(stillUp, 'the laptop in the room is still serving the round');
try { await fetch(appUrl, { signal: AbortSignal.timeout(2000) }); ok(false,'the app host should be unreachable'); }
catch { ok(true, 'and the app can no longer be downloaded from the web'); }

console.log('\nCAN A MEMBER STILL PLAY?');
await cdp('Page.navigate',{url:appUrl}); await settle(5000);
const body = await text();
ok(body.length > 40, `the app still loads, from the phone's own cache (${body.length} chars on screen)`);
ok(!/this site can.t be reached|err_connection/i.test(body), 'not a browser error page');
const base = await js(`return localStorage.getItem('hvas_api_base')`);
ok(base===api, 'it still knows which venue it belongs to');
// And the round is genuinely reachable from inside the loaded app.
const live = await jsA(`
  try { const r = await fetch('${api}/bingo/state'); const d = await r.json(); return d.status; }
  catch (e) { return 'unreachable: ' + e.message; }`);
ok(live==='live', `and the round is still live and reachable from it (${live})`);

console.log(`\n${pass} passed, ${fail} failed`);
if(fail) console.log('\n--- screen ---\n'+(await text()).slice(0,500));
ws.close();chrome.kill();venue.server.close();
process.exit(fail?1:0);

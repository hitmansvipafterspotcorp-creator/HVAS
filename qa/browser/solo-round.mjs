// What a solo round actually has to do, checked in a real browser.
//
// Five things, each of which was a real complaint about the shipped build:
//
//   1. Every game played the same songs. There was one hand-typed solo list,
//      so "themed night" meant nothing outside the venue. Solo now deals from
//      the venue's own decks — pick Trap, get Trap.
//   2. Nothing told you when the next song was coming. The calls just arrived.
//   3. The round kept running while you were performing. You would open a lip
//      sync battle, sing for thirty seconds, and come back to a dozen more
//      calls and sometimes a CPU that had already won.
//   4. The meters were flat CSS bars next to a brand kit full of meter art.
//   5. A 5x5 card was being drawn in a portrait column.
//
// None of these fail a build or a server test. All five are visible in two
// seconds of using the app, which is where they were found.
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
const appUrl=`http://127.0.0.1:${web.address().port}/HVAS/`;
const PORT=9393;
const chrome=spawn(CHROME,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
  `--remote-debugging-port=${PORT}`,`--user-data-dir=/tmp/cdp-soloround-${Date.now()}`,'--window-size=430,932',
  '--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows',
  '--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','about:blank'],{stdio:'ignore'});
let wsUrl=null;
for(let i=0;i<60&&!wsUrl;i++){try{const l=await(await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();const p=l.find(t=>t.type==='page');if(p?.webSocketDebuggerUrl)wsUrl=p.webSocketDebuggerUrl;}catch{}if(!wsUrl)await new Promise(r=>setTimeout(r,300));}
const ws=new WebSocket(wsUrl);await new Promise(r=>ws.addEventListener('open',r));
let id=0;const w=new Map();
ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&w.has(m.id)){w.get(m.id)(m);w.delete(m.id);}
  if(m.method==='Runtime.exceptionThrown')console.log('  [PAGE ERROR]',m.params.exceptionDetails.exception?.description?.slice(0,300));});
const cdp=(m,p={})=>new Promise(res=>{const i=++id;w.set(i,res);ws.send(JSON.stringify({id:i,method:m,params:p}));});
await cdp('Runtime.enable');
const js=async e=>{const r=await Promise.race([cdp('Runtime.evaluate',{expression:`(()=>{${e}})()`,returnByValue:true,awaitPromise:true}),new Promise(res=>setTimeout(()=>res({T:1}),15000))]);return r.T?'<<TIMEOUT>>':(r.result?.exceptionDetails?('EXC '+r.result.exceptionDetails.text):r.result?.result?.value);};
const jsA=async e=>{const r=await Promise.race([cdp('Runtime.evaluate',{expression:`(async()=>{${e}})()`,returnByValue:true,awaitPromise:true}),new Promise(res=>setTimeout(()=>res({T:1}),15000))]);return r.T?'<<TIMEOUT>>':r.result?.result?.value;};
const settle=ms=>new Promise(r=>setTimeout(r,ms));
// Solo will not call a square without a song playing — "no YouTube, no game" is
// the rule, not a bug. So the suite supplies the player rather than reaching out
// to youtube.com, which would make every run depend on a third party's uptime
// and a search result that changes. See qa/browser/fake-youtube.js.
await cdp('Page.enable');
const FAKE_YT = await readFile(new URL('./fake-youtube.js', import.meta.url), 'utf8');
const fakeYouTube = (cfg) => cdp('Page.addScriptToEvaluateOnNewDocument',
  { source: `window.__FAKE_YT=${JSON.stringify(cfg||{})};\n${FAKE_YT}` });
await fakeYouTube({ duration: 210 });
const text=async()=>(await js('return document.body?document.body.innerText:""'))||'';
const tap=n=>js(`const t=${JSON.stringify(n)}.toLowerCase();const el=[...document.querySelectorAll('button')].find(b=>(b.innerText||'').toLowerCase().includes(t)&&!b.disabled&&b.offsetParent);if(!el)return false;el.click();return true;`);
const tapAny=n=>js(`const t=${JSON.stringify(n)}.toLowerCase();const hit=s=>[...document.querySelectorAll(s)].find(b=>(b.innerText||'').toLowerCase().includes(t)&&b.offsetParent&&(b.innerText||'').length<220);const el=hit('button')||hit('a,[role="button"]')||hit('li,article,div');if(!el)return false;el.click();return true;`);
const fill=(ph,v)=>js(`const el=[...document.querySelectorAll('input')].find(i=>(i.placeholder||'').includes(${JSON.stringify(ph)}));if(!el)return false;Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(v)});el.dispatchEvent(new Event('input',{bubbles:true}));return true;`);
const rotate=(w2,h2)=>cdp('Emulation.setDeviceMetricsOverride',{width:w2,height:h2,deviceScaleFactor:1,mobile:true,screenOrientation:{angle:w2>h2?90:0,type:w2>h2?'landscapePrimary':'portraitPrimary'}});
const dropSW=()=>jsA(`if(navigator.serviceWorker){for(const r of await navigator.serviceWorker.getRegistrations())await r.unregister();}if(window.caches){for(const k of await caches.keys())await caches.delete(k);}return true;`);
let pass=0,fail=0;const ok=(c,m)=>{if(c){pass++;console.log('  ✓',m);}else{fail++;console.log('  ✗',m);}};

await cdp('Page.navigate',{url:appUrl});await settle(2200);await dropSW();
await js(`localStorage.setItem('hvas_hub_off','1');return 1;`);
await cdp('Page.navigate',{url:appUrl});await settle(3000);
await tapAny('Member Sign In');await settle(1400);
await fill('First name','Round');await fill('(850)','850-960-0007');await settle(400);
await tap('Continue');await settle(2500);
let reached=false;
for(let i=0;i<20&&!reached;i++){await js(`const b=document.querySelector('[data-target="lobby"]');if(b)b.click();return 1;`);await settle(1300);reached=/solo vs cpu/i.test(await text());}
ok(reached,'Lip Sync Bingo opens with no venue');

console.log('\nTHE MENU IS THREE THINGS, NOT FOUR');
const tabs=await js(`return [...document.querySelectorAll('.bingo-mode-tabs .staff-hub-tab')].map(b=>b.innerText.trim()).join(' | ')`);
console.log('   [tabs]',tabs);
ok(!/host/i.test(tabs),'Host is not a fourth tab competing with the game');
ok(/venue round/i.test(tabs)&&/solo/i.test(tabs)&&/record/i.test(tabs),'the three that matter are there');
ok(await js(`return !!document.querySelector('.bingo-host-link')`),'and hosting is still one tap, on its own line');

console.log('\nPICK THE NIGHT');
await tap('Solo vs CPU');await settle(1400);
const themes=await js(`return [...document.querySelectorAll('.deck-chip strong')].map(b=>b.innerText.trim())`);
console.log('   [themes]',Array.isArray(themes)?themes.join(', '):themes);
for(const want of ['Ladies Night','Trap','Crunk','Country','Pop','Movies','Kings of R&B','Afrobeats','EDM / House'])
  ok(Array.isArray(themes)&&themes.includes(want),`${want} is on the menu`);
ok(Array.isArray(themes)&&themes.some(t=>/Tallahassee/i.test(t)),'and the home-team deck is too');

console.log('\nAND THE PICK IS WHAT YOU PLAY');
ok(await js(`const el=[...document.querySelectorAll('.deck-chip')].find(b=>/^Trap/.test(b.innerText.trim()));if(!el)return false;el.click();return true;`),
   'Trap is selectable');
await settle(500);
ok(/start solo round · trap/i.test(await text()),'the start button names the deck you picked');
await tap('Start Solo Round');await settle(2000);
// Portrait: the card must not be drawn at all.
console.log('\nSIDEWAYS PLAY ONLY');
let body=await text();
ok(/turn|sideways|rotate/i.test(body),'held upright, a dealt round asks for the phone to be turned');
ok(await js(`return document.querySelectorAll('.k-tile').length`)===0,'and no card is drawn behind the gate');
await rotate(932,430);await settle(1500);
const tiles=await js(`return document.querySelectorAll('.k-tile').length`);
ok(tiles===25,`turned sideways, the big card is there (${tiles} squares)`);
const artists=await js(`return [...document.querySelectorAll('.k-tile-artist')].map(e=>e.innerText.trim())`);
console.log('   [card]',Array.isArray(artists)?artists.slice(0,6).join(', ')+'…':artists);
const TRAP=['Future','Migos','Gucci Mane','21 Savage','Young Thug','Travis Scott','Lil Baby','Playboi Carti','Lil Uzi Vert','Gunna','Roddy Ricch','Moneybagg Yo','Chief Keef','Rae Sremmurd','Metro Boomin','Waka Flocka Flame','Lil Durk','Key Glock','2 Chainz','Young Dolph','Jeezy','Desiigner','Sheck Wes'];
// The card renders artists uppercased, so compare on a normalised form rather
// than on what the CSS happens to be doing today.
const norm=(x)=>String(x).toLowerCase().replace(/[^a-z0-9]/g,'');
const trapSet=new Set(TRAP.map(norm));
const strays=(Array.isArray(artists)?artists:[]).filter(a=>!trapSet.has(norm(a)));
ok(Array.isArray(artists)&&artists.length>0&&strays.length===0,
   `every square on the card comes from the Trap deck — the theme is the game${strays.length?` (stray: ${strays.join(', ')})`:''}`);

console.log('\nTHE CLOCK IS RUNNING');
ok(await js(`return !!document.querySelector('.solo-callclock')`),'there is a countdown to the next song');
const t1=await js(`const e=document.querySelector('.solo-callclock .ui-meter-right');return e?e.innerText.trim():''`);
await settle(700);
const t2=await js(`const e=document.querySelector('.solo-callclock .ui-meter-right');return e?e.innerText.trim():''`);
console.log('   [clock]',t1,'→',t2);
ok(t1!==t2,'and it is actually moving, not a painted number');

console.log('\nTHE METERS ARE THE VENUE’S OWN ART');
const art=await js(`
  const m=document.querySelector('.ui-meter'); if(!m) return 'no meter';
  const track=m.querySelector('.ui-meter-track-art'), head=m.querySelector('.ui-meter-head-art'),
        fill=m.querySelector('.ui-meter-fill-art');
  return JSON.stringify({track:track?.getAttribute('src')||'', head:head?.getAttribute('src')||'',
    fill:getComputedStyle(fill||document.body).backgroundImage,
    trackLoaded:!!(track&&track.naturalWidth>0), headLoaded:!!(head&&head.naturalWidth>0)});`);
console.log('   [art]',art);
const a=(()=>{try{return JSON.parse(art);}catch{return null;}})();
ok(!!a,'a meter is on screen');
ok(a&&/loy_track\.png$/.test(a.track),'the track is the rank track art');
ok(a&&/loy_marker\.png$/.test(a.head),'the head is the rank marker art');
ok(a&&/loy_fill\.png/.test(a.fill),'and the fill is the rank fill art');
ok(a&&a.trackLoaded&&a.headLoaded,'the art actually loaded, rather than 404ing into an empty box');
ok(await js(`return [...document.querySelectorAll('.ui-meter')].length >= 3`),
   'the clock, the rivals and your own progress all read on the same instrument');

console.log('\nTHE ROUND HOLDS WHILE YOU PERFORM');
// Open a lip sync battle, then watch the call count for longer than a call
// interval. It must not move.
// The battle takes the whole screen, so the HUD's call count goes with it —
// read it on the card, on the last look before the battle opens.
const calls=async()=>{const t=await text();const m=t.match(/(\d+)\s+called/);return m?Number(m[1]):-1;};
let opened=false,before=-1;
for(let i=0;i<40&&!opened;i++){
  await settle(1000);
  const seen=await calls(); if(seen>=0) before=seen;
  await js(`for(const b of document.querySelectorAll('.k-tile--lipsync')) if(!b.disabled) b.click();`);
  await settle(400);
  opened=/perform it/i.test(await text());
}
ok(opened,'a called lip sync square opens a battle');
ok(before>0,`the round had called songs before the battle opened (${before})`);
// Stand on the battle stage for longer than several call intervals, then come
// back to the card. If the round kept running, the count moved.
await settle(7000);   // ~3x the call interval
await tap('Pass');
await settle(1500);
const after=await calls();
console.log('   [calls]',before,'→',after,'(7s spent on the battle stage)');
ok(after===before,`and called nothing more while the performer was on the floor (${after})`);
// And it picks straight back up rather than staying frozen.
await settle(3000);
const resumed=await calls();
console.log('   [calls] after returning:',resumed);
ok(resumed>after,`the round resumes once the performance is over (${resumed})`);

console.log('\nTHE CLIP IS THE CLOCK');
// Nobody sets a performance length. A 210s track cuts to the venue's window —
// 25s in, 75s long — so a take started at the top of the clip has ~75s to run,
// and the stage shows that countdown rather than waiting on the performer.
await settle(1200);
let opened2=false;
for(let i=0;i<40&&!opened2;i++){
  await settle(900);
  await js(`for(const b of document.querySelectorAll('.k-tile--lipsync')) if(!b.disabled) b.click();`);
  await settle(350);
  opened2=/perform it/i.test(await text());
}
ok(opened2,'another lip sync square opens a battle');
const cue=await js(`return JSON.stringify(window.__FAKE_YT_STATE||{})`);
console.log('   [player]',cue);
const st=(()=>{try{return JSON.parse(cue);}catch{return{};}})();
ok(st.loads>0,`the round cued songs on the player (${st.loads})`);
ok(st.seekedTo===25,`and cut to the venue's window on a 210s track (seeked to ${st.seekedTo}s)`);
await tap('Perform it'); await settle(2500);
const clock=await js(`const e=document.querySelector('.battle-clock');return e?e.innerText.trim():''`);
const mm=String(clock).match(/^(\d+):(\d+)$/);
const secs=mm?Number(mm[1])*60+Number(mm[2]):null;
console.log('   [stage clock]',clock||'(none)',secs!=null?`= ${secs}s`:'');
ok(secs!=null,'the stage carries a countdown rather than an open-ended take');
// A 210s track cuts to 25s in for 75s. The take opens with what is left of it.
ok(secs!=null&&secs>10&&secs<=75,`and it is the clip's length, not a fixed timer (${secs}s of a 75s window)`);
ok(await js(`return !!document.querySelector('.battle-clipmeter')`),'and the clip draining is on a meter, not just a number');

console.log('\nNO YOUTUBE, NO GAME');
// Make the player fail on its very first song and start a fresh round. Nothing
// should get called into the silence.
await fakeYouTube({ duration: 210, failAfter: 1 });
await cdp('Page.navigate',{url:appUrl}); await settle(3000);
await rotate(430,932); await settle(600);
await tapAny('Enter ·') || await tapAny('Member Sign In'); await settle(2200);
let back=false;
for(let i=0;i<20&&!back;i++){await js(`const b=document.querySelector('[data-target="lobby"]');if(b)b.click();return 1;`);await settle(1200);back=/solo vs cpu/i.test(await text());}
await tap('Solo vs CPU'); await settle(1200);
await tap('Start Solo Round'); await settle(1500);
await rotate(932,430); await settle(1200);
await settle(6000);   // several call intervals with a dead player
const dead=await text();
console.log('   [screen]',dead.replace(/\n/g,' / ').slice(0,220));
ok(/no song, no game|will not play/i.test(dead),'the round says plainly that it stopped for want of a song');
const deadCalls=(dead.match(/(\d+)\s+called/)||[])[1];
console.log('   [calls with no music]',deadCalls);
ok(Number(deadCalls||0)<=1,`and called at most the one song it was trying to play (${deadCalls})`);

console.log(`\n${pass} passed, ${fail} failed`);
if(fail){console.log('\n--- screen ---\n'+(await text()).slice(0,900));}
ws.close();chrome.kill();web.close();process.exit(fail?1:0);

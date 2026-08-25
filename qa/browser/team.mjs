// Onboarding somebody onto the team, on two phones.
//
// The venue used to run on two shared codes. This suite exists to check that
// the replacement is actually usable by a person who is busy — the owner types
// a name and holds up a screen, and the other phone is signed in as themselves.
// If that takes more than one screen it will not happen on a Saturday, and the
// venue will keep using the shared code forever.
//
// It also checks the part that is easy to get wrong in the other direction:
// door staff do not get a Team tab at all. A tab that exists to refuse you
// reads as a broken app rather than as something that is not your job.
//
// It runs two independent browser contexts against one real backend, because
// "the code works on the phone that generated it" is not the claim.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
process.env.HVAS_HOST_CODE = 'HOST850'; process.env.HVAS_STAFF_CODE = 'DOOR850';
const { createApp } = await import('/home/claude/hvas/server/src/app.mjs');
const { server: api } = createApp({ dataDir: `/tmp/hvas-team-${Date.now()}` });
await new Promise((r) => api.listen(0, r));
const API = `http://127.0.0.1:${api.address().port}`;
const call = async (m, p, b, t) => {
  const r = await fetch(API + p, { method: m, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: b ? JSON.stringify(b) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

const APP='/home/claude/hvas/hitmans_vip_membership_app/dist';
const SHOT=process.env.HVAS_SHOTS||'';
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
// One static server PER PHONE, and therefore one origin per phone.
//
// This is not fussiness. Two pages served from the same host and port share one
// localStorage, so a second "phone" signing in silently overwrites the first
// one's session token — which looked exactly like the owner losing their admin
// rights mid-suite, and cost an hour of suspecting the server. Separate ports
// are the cheapest thing that makes these devices actually separate.
const servers=[];
const serveApp=async()=>{
  const web=createServer(async(q,s)=>{let p=decodeURIComponent(q.url.split('?')[0]).replace(/^\/HVAS/,'')||'/';if(p==='/'||!extname(p))p='/index.html';
    try{const b=await readFile(join(APP,normalize(p)));s.writeHead(200,{'Content-Type':T[extname(p)]||'application/octet-stream'});s.end(b);}catch{s.writeHead(404).end('no');}});
  await new Promise(r=>web.listen(0,r));
  servers.push(web);
  return `http://127.0.0.1:${web.address().port}/HVAS/`;
};
const CHROME='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

// One browser, two independent pages. Separate origins would be cleaner still,
// but separate PAGES is what makes the second phone a second phone here: the
// invite has to survive leaving the screen that made it.
const PORT=9471;
const chrome=spawn(CHROME,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
  `--remote-debugging-port=${PORT}`,`--user-data-dir=/tmp/cdp-team-${Date.now()}`,'--window-size=430,932','about:blank'],{stdio:'ignore'});
let base=null;
for(let i=0;i<60&&!base;i++){try{const l=await(await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();base=l.webSocketDebuggerUrl;}catch{}if(!base)await new Promise(r=>setTimeout(r,300));}

// A tiny CDP client per page, so the two phones cannot see each other's state.
const settle=ms=>new Promise(r=>setTimeout(r,ms));
async function phone(label){
  const appUrl=await serveApp();
  const t=await(await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`,{method:'PUT'})).json();
  const ws=new WebSocket(t.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r));
  let id=0;const w=new Map();const errors=[];
  ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&w.has(m.id)){w.get(m.id)(m);w.delete(m.id);return;}
    if(m.method==='Runtime.exceptionThrown'){const d=String(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text||'');
      if(!/ServiceWorker/i.test(d))errors.push(`[${label}] `+d.split('\n')[0].slice(0,140));}});
  const cdp=(m,p={})=>new Promise(res=>{const i=++id;w.set(i,res);ws.send(JSON.stringify({id:i,method:m,params:p}));});
  await cdp('Runtime.enable');await cdp('Page.enable');
  const js=async e=>{const r=await cdp('Runtime.evaluate',{expression:`(()=>{${e}})()`,returnByValue:true,awaitPromise:true});
    if(r.result?.exceptionDetails)console.log(`   [${label} EXC]`,String(r.result.exceptionDetails.exception?.description||r.result.exceptionDetails.text).slice(0,200));
    if(r.error)console.log(`   [${label} CDP ERR]`,JSON.stringify(r.error).slice(0,200));
    return r.result?.result?.value;};
  const jsA=async e=>(await cdp('Runtime.evaluate',{expression:`(async()=>{${e}})()`,returnByValue:true,awaitPromise:true})).result?.result?.value;
  return {
    label, errors, cdp, js, jsA,
    go: async()=>{ await cdp('Page.navigate',{url:appUrl}); await settle(2500);
      await jsA(`if(navigator.serviceWorker){for(const r of await navigator.serviceWorker.getRegistrations())await r.unregister();}if(window.caches){for(const k of await caches.keys())await caches.delete(k);}return 1;`);
      await js(`localStorage.setItem('hvas_hub_off','1');localStorage.setItem('hvas_api_base',${JSON.stringify(API)});return 1;`);
      await cdp('Page.navigate',{url:appUrl}); await settle(7000); },
    text: ()=>js(`return (document.body.innerText||'').replace(/\\n+/g,' / ')`),
    tap: n=>js(`const t=${JSON.stringify(n)}.toLowerCase();const el=[...document.querySelectorAll('button')].find(b=>(b.innerText||'').toLowerCase().includes(t)&&!b.disabled&&b.offsetParent);if(!el)return false;el.click();return true;`),
    type: (sel,v)=>js(`const el=document.querySelector(${JSON.stringify(sel)});if(!el)return false;
      const p=Object.getPrototypeOf(el);Object.getOwnPropertyDescriptor(p,'value').set.call(el,${JSON.stringify(v)});
      el.dispatchEvent(new Event('input',{bubbles:true}));return true;`),
    shot: async n=>{if(!SHOT)return;const r=await cdp('Page.captureScreenshot',{format:'png'});if(r.result?.data)await writeFile(join(SHOT,n),Buffer.from(r.result.data,'base64'));},
  };
}
let pass=0,fail=0;
const ok=(c,m)=>{console.log(`  ${c?'PASS':'FAIL'}  ${m}`);c?pass++:fail++;};

// Getting to the team screen: five taps on the fine print, Host, code, Team tab.
const openTeam = async (ph, code) => {
  await ph.go();
  await ph.js(`const b=document.querySelector('.door-fine');for(let i=0;i<5;i++)b.click();return 1;`);
  await settle(1500);
  await ph.tap('Staff Check-In');
  await settle(1500);
  await ph.type('.auth-card input', code);
  await settle(300);
  await ph.tap('Unlock');
  await settle(4000);
};

const owner = await phone('owner');
const newHire = await phone('new hire');

// Add somebody from the Team screen and read back the code that appears.
const addPerson = async (ph, who, role) => {
  await ph.type('#team-name', who);
  await settle(300);
  if (role) await ph.js(`const s=document.querySelector('.team-add select');const p=Object.getPrototypeOf(s);
    Object.getOwnPropertyDescriptor(p,'value').set.call(s,${JSON.stringify(role)});
    s.dispatchEvent(new Event('change',{bubbles:true}));return 1;`);
  await settle(200);
  await ph.tap('Add');
  await settle(3000);
  return ph.js(`return document.querySelector('.team-code')?.innerText?.trim()||''`);
};

console.log('THE VERY FIRST TAP: THE OWNER MAKES THEMSELVES AN OWNER');
await openTeam(owner, 'HOST850');
console.log('   [after code]', (await owner.text()).slice(0, 200));
ok(await owner.tap('Team'), 'the venue code lands on a screen with a Team tab');
await settle(2500);
const team0 = await owner.text();
console.log('   [team]', team0.slice(120, 640));
ok(/start here/i.test(team0), 'and the empty venue says what the first move is');
ok(/you are the owner/i.test(team0), 'in the words of what it makes them');
ok(/nobody has their own sign-in yet/i.test(team0), 'with nobody named yet, said plainly');
await owner.shot('team-1-bootstrap.png');

const ownerCode = await addPerson(owner, 'Kenya', 'host');
const madeOwner = await owner.text();
console.log('   [owner invite]', ownerCode, '|', madeOwner.slice(120, 460));
ok(/^[A-Z2-9]{8}$/.test(ownerCode), `a code comes back (${ownerCode})`);
ok(/becomes the owner of this venue/i.test(madeOwner), 'and it says this one makes an owner');
// The owner scans their own code with the same phone — that is the whole setup.
await openTeam(owner, ownerCode);
await owner.tap('Team'); await settle(2500);
const asKenya = await owner.text();
console.log('   [as owner]', asKenya.slice(120, 460));
ok(/Signed in as/i.test(asKenya) && /Kenya/.test(asKenya), 'the phone is now Kenya, not a shared code');
ok(!/start here/i.test(asKenya), 'and the setup prompt is gone');
await owner.shot('team-2-owner.png');

console.log('\nADDING SOMEBODY IS TYPING THEIR NAME');
const code = await addPerson(owner, 'Trey');
const invited = await owner.text();
console.log('   [invite]', code, '|', invited.slice(120, 520));
ok(/^[A-Z2-9]{8}$/.test(code), `a code comes back, readable across a room (${code})`);
ok(await owner.js(`return !!document.querySelector('.team-qr')`), 'shown as a QR to hold up');
ok(/expires in/i.test(invited), 'with how long it is good for');
await owner.shot('team-3-invite.png');

console.log('\nTHE OTHER PHONE USES IT');
await openTeam(newHire, code);
const hired = await newHire.text();
console.log('   [new hire]', hired.slice(0, 260));
ok(!/wrong code|access code/i.test(hired), 'the code gets them in');
ok((await newHire.js(`return localStorage.getItem('hvas_api_staff_name')`)) === 'Trey',
   'and the phone knows it is Trey');
ok((await newHire.js(`return localStorage.getItem('hvas_api_staff_named')`)) === '1',
   'signed in as a person, not as a role');
await newHire.shot('team-4-claimed.png');

console.log('\nAND ONLY ONCE');
const third = await phone('third phone');
await openTeam(third, code);
const denied = await third.text();
console.log('   [third]', denied.slice(0, 200));
ok(/already been used/i.test(denied), 'a second phone with the same code is told why it failed');
ok(!(await third.js(`return localStorage.getItem('hvas_api_staff_token')`)), 'and gets no session');

console.log('\nWHAT THE OWNER SEES NOW');
// The owner is still holding the code up. It should tell them it landed.
const gotIt = await owner.text();
ok(/is in\. you can put this away/i.test(gotIt), 'the code screen tells the owner the scan landed');
await owner.tap('Done'); await settle(3000);
const roster = await owner.text();
console.log('   [roster]', roster.slice(160, 620));
ok(/Trey/.test(roster), 'Trey is on the roster');
ok(/last on/i.test(roster), 'with when his phone was last used');
ok(/2 people have their own sign-in/i.test(roster), 'and the approver count counts Kenya and Trey');
ok(!/\b[01] different people\b/i.test(roster), 'and the count reads like English at every value');
await owner.shot('team-5-roster.png');

console.log('\nREMOVING HIM IS TWO TAPS AND IT IS IMMEDIATE');
ok(await owner.tap('Remove'), 'Remove asks first');
await settle(600);
ok(/Remove Trey now/i.test(await owner.text()), 'and the second tap says what it does');
ok(await owner.tap('Remove Trey now'), 'the host confirms');
await settle(3000);
const afterRemove = await owner.text();
console.log('   [after remove]', afterRemove.slice(100, 500));
ok(!/Trey/.test(afterRemove), 'Trey is off the roster');
// The thing that makes removal real: not that the row is gone here, but that
// his phone stops working on its very next request rather than in 12 hours.
const treyToken = await newHire.js(`return localStorage.getItem('hvas_api_staff_token')`);
const treyNow = await call('GET', '/bingo/board', null, treyToken);
ok(treyNow.status === 401, `and his phone fails on its next tap (${treyNow.status})`);
await owner.shot('team-6-removed.png');

console.log('\nAND A DOOR PHONE NEVER SEES ANY OF THIS');
const doorCode = await addPerson(owner, 'Bex');
const doorPhone = await phone('door');
await openTeam(doorPhone, doorCode);
const doorText = await doorPhone.text();
console.log('   [door]', doorText.slice(0, 300));
ok((await doorPhone.js(`return localStorage.getItem('hvas_api_staff_name')`)) === 'Bex', 'Bex is signed in as Bex');
ok((await doorPhone.js(`return [...document.querySelectorAll('.staff-hub-tab')].map(b=>b.innerText).join('|')`) || '')
   .toLowerCase().includes('team') === false,
   'and there is no Team tab on her phone at all');
await doorPhone.shot('team-7-door.png');

const errs=[...owner.errors,...newHire.errors,...third.errors,...doorPhone.errors];
console.log('\nPAGE ERRORS');
console.log(errs.length?errs.join('\n'):'  none');
ok(errs.length===0,'no page errors');
console.log(`\n${pass} passed, ${fail} failed`);
chrome.kill();servers.forEach(w=>w.close());api.close();
process.exit(fail?1:0);

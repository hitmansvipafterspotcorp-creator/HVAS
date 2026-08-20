// Manual vs auto, on both sides of the night. The house style is manual: the
// host calls each song, a player taps what they hear. Each side can opt into
// auto for itself, and neither choice touches the other. A LIP SYNC square is
// never auto-filled — those are still earned by performing.
process.env.HVAS_HOST_CODE='HOST850'; process.env.BINGO_PODIUM_SECONDS='600';
process.env.BINGO_SONG_SECONDS='3';           // so auto-advance is observable
const { createApp } = await import('./src/app.mjs');
const { server } = createApp({ dataDir: `/tmp/hvas-tog-${Date.now()}` });
await new Promise(r=>server.listen(0,r));
const api=`http://127.0.0.1:${server.address().port}`;
const call=async(m,p,b,t)=>{const r=await fetch(api+p,{method:m,headers:{'Content-Type':'application/json',...(t?{Authorization:`Bearer ${t}`}:{})},body:b?JSON.stringify(b):undefined});return{status:r.status,body:await r.json().catch(()=>({}))};};
const mk=async(ph,nm)=>{const s=await call('POST','/auth/member/start',{contact:ph});return (await call('POST','/auth/member/verify',{contact:ph,code:s.body.devCode,name:nm})).body;};
const host=(await call('POST','/auth/staff',{code:'HOST850'})).body.token;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0; const ok=(c,m)=>{if(c){pass++;console.log('  ✓',m);}else{fail++;console.log('  ✗',m);}};

const rico=await mk('850-906-0001','Rico'); await call('POST','/bingo/join',{},rico.token); await call('POST','/bingo/ready',{ready:true},rico.token);
const nova=await mk('850-906-0002','Nova'); await call('POST','/bingo/join',{},nova.token); await call('POST','/bingo/ready',{ready:true},nova.token);
await call('POST','/bingo/start',{},host);

console.log('DEFAULTS');
let st=(await call('GET','/bingo/state',null,host)).body;
ok(st.autoCall === false, 'song calling starts MANUAL, not auto');
ok(((await call('GET','/bingo/state',null,rico.token)).body.me.autofill) === false, 'a card starts on manual tapping');

console.log('\nMANUAL — the night does not run itself');
const before=(await call('GET','/bingo/state',null,host)).body.calls.length;
await wait(9000);                                  // 3x the song window
const after=(await call('GET','/bingo/state',null,host)).body.calls.length;
ok(after === before, `no song advanced on its own while manual (${before} → ${after})`);
await call('POST','/bingo/call',{},host);
ok((await call('GET','/bingo/state',null,host)).body.calls.length === before+1, 'the host can still call one by hand');

console.log('\nAUTO — the play timer runs the night');
await call('POST','/bingo/auto',{on:true},host);
ok((await call('GET','/bingo/state',null,host)).body.autoCall === true, 'host switched calling to auto');
const b2=(await call('GET','/bingo/state',null,host)).body.calls.length;
await wait(9000);
const a2=(await call('GET','/bingo/state',null,host)).body.calls.length;
ok(a2 > b2, `songs advance by themselves on auto (${b2} → ${a2})`);
await call('POST','/bingo/auto',{on:false},host);
ok((await call('GET','/bingo/state',null,host)).body.autoCall === false, 'and the host can switch back to manual');

console.log('\nAUTO-FILL — the player\'s own choice');
let mine=(await call('GET','/bingo/state',null,rico.token)).body;
const calledNow=new Set(mine.calls.map(c=>c.id));
const holds=mine.me.card.filter(sq=>sq&&!sq.free&&sq.type!=='lipsync'&&calledNow.has(sq.id));
ok(mine.me.covered.length === 0, 'nothing was covered while the player was on manual');
const r=await call('POST','/bingo/autofill',{on:true},rico.token);
ok(r.status === 200 && r.body.autofill === true, 'player switches their card to auto-fill');
mine=(await call('GET','/bingo/state',null,rico.token)).body;
ok(mine.me.covered.length === holds.length && holds.length > 0,
   `turning it on catches up on songs already played (${mine.me.covered.length} covered)`);
ok(!mine.me.covered.some(id=>mine.me.card.find(sq=>sq&&sq.id===id)?.type==='lipsync'),
   'no LIP SYNC square was ever filled in — those are still performed for');

// A new call should land on Rico's card by itself, and not on Nova's.
const novaBefore=(await call('GET','/bingo/state',null,nova.token)).body.me.covered.length;
for (let i=0;i<12;i++){
  await call('POST','/bingo/call',{},host);
  const s2=(await call('GET','/bingo/state',null,rico.token)).body;
  const last=s2.calls[s2.calls.length-1];
  if (last && last.type!=='lipsync' && s2.me.card.some(sq=>sq&&sq.id===last.id)) {
    ok(s2.me.covered.includes(last.id), 'a newly called song covers itself on an auto-fill card');
    break;
  }
}
ok((await call('GET','/bingo/state',null,nova.token)).body.me.covered.length === novaBefore,
   'a player still on manual is untouched by the other player\'s setting');
await call('POST','/bingo/autofill',{on:false},rico.token);
ok((await call('GET','/bingo/state',null,rico.token)).body.me.autofill === false, 'player can switch back to tapping');

console.log(`\n${pass} passed, ${fail} failed`);
server.close(); process.exit(fail?1:0);

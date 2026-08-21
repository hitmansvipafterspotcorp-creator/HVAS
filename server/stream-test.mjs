// Live battle video, costed for the internet rather than a venue LAN.
//
// On a LAN a frame was free. Over a tunnel every frame is somebody's mobile
// data and the venue's own upload, so the performer's phone is told how many
// screens are actually watching and backs off to a heartbeat when that is
// nobody. These assertions are what stop that regressing into a broadcast to
// an empty room.
process.env.HVAS_HOST_CODE='HOST850';
const { createApp } = await import('./src/app.mjs');
const { server } = createApp({ dataDir: `/tmp/hvas-wc-${Date.now()}` });
await new Promise(r=>server.listen(0,r));
const api=`http://127.0.0.1:${server.address().port}`;
const call=async(m,p,b,t)=>{const r=await fetch(api+p,{method:m,headers:{'Content-Type':'application/json',...(t?{Authorization:`Bearer ${t}`}:{})},body:b?JSON.stringify(b):undefined});return{status:r.status,body:await r.json().catch(()=>({}))};};
const mk=async(ph,nm)=>{const s=await call('POST','/auth/member/start',{contact:ph});return (await call('POST','/auth/member/verify',{contact:ph,code:s.body.devCode,name:nm})).body;};
const host=(await call('POST','/auth/staff',{code:'HOST850'})).body.token;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0,fail=0;const ok=(c,m)=>{if(c){pass++;console.log('  ✓',m);}else{fail++;console.log('  ✗',m);}};

const A=await mk('850-970-0001','Ayo'), B=await mk('850-970-0002','Bree');
const C=await mk('850-970-0003','Watcher1'), D=await mk('850-970-0004','Watcher2');
await call('POST','/lipsync/create',{format:'open'},host);
for(const m of [A,B]) await call('POST','/lipsync/join',{},m.token);
await call('POST','/lipsync/start',{},host);
const bout=(await call('GET','/lipsync/state',null,host)).body.event.bout.id;
for(const m of [A,B]) await call('POST','/battle/respond',{battleId:bout,accept:true},m.token);
await call('POST','/battle/perform',{battleId:bout,memberId:A.member.id},host);

const cast=()=>call('POST','/battle/frame',{battleId:bout,frame:'data:image/jpeg;base64,'+'x'.repeat(400)},A.token);
console.log('PAYING ONLY FOR REAL VIEWERS');
let r=await cast();
ok(r.body.watchers===0, `nobody watching yet, so the performer is told 0 (${r.body.watchers})`);
await call('GET',`/battle/frame?battleId=${bout}`,null,C.token);
r=await cast();
ok(r.body.watchers===1, 'one screen opens the stream and the count reflects it');
await call('GET',`/battle/frame?battleId=${bout}`,null,D.token);
await call('GET',`/battle/frame?battleId=${bout}`,null,host);
r=await cast();
ok(r.body.watchers===3, `two more join, including the TV (${r.body.watchers})`);
// A watcher that stops looking stops counting, with nothing to clean up.
console.log('\nAND STOPS PAYING WHEN THEY LEAVE');
await wait(6500);
r=await cast();
ok(r.body.watchers===0, `after everyone stops polling the count falls back to 0 (${r.body.watchers})`);
await call('GET',`/battle/frame?battleId=${bout}`,null,C.token);
r=await cast();
ok(r.body.watchers===1, 'and comes straight back when a screen reopens');

console.log('\nGUARDS');
ok((await call('POST','/battle/frame',{battleId:bout,frame:'data:image/jpeg;base64,zz'},B.token)).status===403,
   'someone who is not performing still cannot cast');

console.log(`\n${pass} passed, ${fail} failed`);
server.close(); process.exit(fail?1:0);

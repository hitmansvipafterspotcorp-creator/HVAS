'use strict';
/**
 * StoryMode — arcade-ladder fighter campaign + quick versus.
 * Wires: character select → VS screen (portraits + taunt) → 1v1 fight
 *        (VersusEngine) → win/lose dialogue → next rival → ending.
 *
 * Builds its own DOM screens inside #screen-area and reuses the
 * #gameCanvas in #screen-gameplay for the actual fights.
 */
const StoryMode = (() => {

  // ── HITMAN'S RISE — the arcade ladder ───────────────────────────────────────
  // Each rung: opponent charId, the venue/stage it happens at, and dialogue.
  const LADDER = [
    { opp:30, venue:'CAFE 8FIFTY — THE LINE', stage:{sky:'#10001a',ground:'#08000f',accent:'#6600cc',name:'CAFE 8FIFTY'},
      pre:['PREDATOR PETE: "Line\'s closed, champ. You\'re not on the list."',
           'YOU: "I don\'t wait in lines. I run the night."'],
      win:'PETE goes down. The line opens. Word travels fast.' },

    { opp:31, venue:'QUICK HIT FUEL — LATE STOP', stage:{sky:'#040014',ground:'#060005',accent:'#ffee00',name:'QUICK HIT FUEL'},
      pre:['AGENT SNOW: "I\'m shutting the whole scene down. Starting with you."',
           'YOU: "Cold night for the wrong move, agent."'],
      win:'SNOW\'s case goes cold. The block stays open.' },

    { opp:12, venue:'KINGDOM COME SALOON — FSU TERRITORY', stage:{sky:'#1a1000',ground:'#0a0500',accent:'#cc4400',name:'KINGDOM COME SALOON'},
      pre:['FSU MALE: "Rattlers don\'t run this block. Seminoles do."',
           'YOU: "Block\'s open season. Let\'s see who\'s still standing."'],
      win:'Garnet and Gold hits the floor. The saloon belongs to the night.' },

    { opp:13, venue:'13 RAVE CLUB — GOLD STANDARD', stage:{sky:'#080030',ground:'#0a000f',accent:'#bb8800',name:'13 RAVE CLUB'},
      pre:['FSU FEMALE: "I counter everything. You have no moves I haven\'t seen."',
           'YOU: "Then watch this one."'],
      win:'The counter game breaks. The rave crowd chants your name.' },

    { opp:21, venue:'HVAS — THE ENTRY', stage:{sky:'#12000a',ground:'#08000f',accent:'#cc0022',name:'HITMANS VIP AFTER SPOT'}, boss:true,
      pre:['BIG SOULJA: "Nobody passes me. Not for status. Not for nothing."',
           'YOU: "Then I\'ll earn the entry the hard way."'],
      win:'BIG SOULJA steps aside. The VIP room is yours to enter.' },

    { opp:20, venue:'CAFE 8FIFTY — THE STAGE', stage:{sky:'#150000',ground:'#0a0000',accent:'#ff0000',name:'KT — FINAL BOSS'}, boss:true, final:true,
      pre:['KT: "This is my house. The owner. The chef. The producer."',
           'KT: "Prove you belong — or get the shutdown."',
           'YOU: "I came to run the night. Let\'s go."'],
      win:'KT nods. Respect earned. You are a certified HITMANS VIP.' },
  ];

  let run = null; // { playerCharId, idx, mode }

  // ── DOM screen scaffolding ──────────────────────────────────────────────────
  function ensureScreens() {
    const host = document.getElementById('screen-area');
    if (!host) return;
    if (!document.getElementById('screen-versus')) {
      const vs = document.createElement('div');
      vs.id = 'screen-versus'; vs.className = 'screen'; vs.style.display = 'none';
      vs.innerHTML = `
        <div class="vs-stage" id="vs-stage">
          <div class="vs-fighters">
            <div class="vs-side vs-left">
              <div class="vs-portrait" id="vs-p1-portrait">🥊</div>
              <div class="vs-fname" id="vs-p1-name">YOU</div>
              <div class="vs-fstyle" id="vs-p1-style"></div>
            </div>
            <div class="vs-mid"><div class="vs-word">VS</div><div class="vs-venue" id="vs-venue"></div></div>
            <div class="vs-side vs-right">
              <div class="vs-portrait" id="vs-p2-portrait">🥊</div>
              <div class="vs-fname" id="vs-p2-name">RIVAL</div>
              <div class="vs-fstyle" id="vs-p2-style"></div>
            </div>
          </div>
          <div class="vs-dialog" id="vs-dialog"></div>
          <button class="vs-fight-btn" id="vs-fight-btn">▶ FIGHT  —  TAP / START</button>
          <div class="vs-rung" id="vs-rung"></div>
        </div>`;
      host.appendChild(vs);
    }
    if (!document.getElementById('screen-result')) {
      const r = document.createElement('div');
      r.id = 'screen-result'; r.className = 'screen'; r.style.display = 'none';
      r.innerHTML = `<div class="result-box" id="result-box"></div>`;
      host.appendChild(r);
    }
  }

  function show(id) { HitgearOS.showScreen(id); }
  function charById(id){ return (window.CHARACTERS||[]).find(c=>c.id===id) || {}; }

  // ── entry points ────────────────────────────────────────────────────────────
  function startStory() {
    ensureScreens();
    HitgearOS.openCharSelect(charId => {
      run = { playerCharId: charId, idx: 0, mode: 'story' };
      nextRung();
    });
  }

  function startArcade() {
    ensureScreens();
    HitgearOS.openCharSelect(charId => {
      run = { playerCharId: charId, idx: 0, mode: 'arcade',
        ladder: shuffledLadder() };
      nextRung();
    });
  }

  function shuffledLadder() {
    const a = LADDER.slice();
    for (let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
    return a;
  }

  function ladder() { return (run && run.ladder) || LADDER; }

  // ── VS screen ────────────────────────────────────────────────────────────────
  function nextRung() {
    const L = ladder();
    if (run.idx >= L.length) { showEnding(true); return; }
    const rung = L[run.idx];
    const p = charById(run.playerCharId), o = charById(rung.opp);
    ensureScreens();
    show('screen-versus');

    const set = (id,v)=>{ const e=document.getElementById(id); if(e) e.textContent=v; };
    const port = (id, ch)=>{ const e=document.getElementById(id); if(e){ e.textContent=ch.emoji||'🥊'; e.style.color=ch.color||'#fff'; e.style.borderColor=ch.color||'#fff'; e.style.boxShadow=`0 0 28px ${ch.color||'#fff'}99, inset 0 0 18px ${ch.color||'#fff'}44`; } };
    port('vs-p1-portrait', p); port('vs-p2-portrait', o);
    set('vs-p1-name', p.shortName||p.name||'YOU');
    set('vs-p2-name', o.shortName||o.name||'RIVAL');
    set('vs-p1-style', p.style||''); set('vs-p2-style', o.style||'');
    set('vs-venue', rung.venue||'');
    set('vs-rung', `RIVAL ${run.idx+1} / ${L.length}` + (rung.final?'  —  FINAL':rung.boss?'  —  BOSS':''));

    const dlg = document.getElementById('vs-dialog');
    if (dlg) dlg.innerHTML = (rung.pre||[]).map(line=>`<div class="vs-line">${line}</div>`).join('');

    const btn = document.getElementById('vs-fight-btn');
    const go = () => { cleanup(); launchFight(rung); };
    function keyGo(e){ if(['Enter',' ','z','Z'].includes(e.key)){ e.preventDefault(); go(); } }
    function cleanup(){ btn && btn.removeEventListener('click', go); document.removeEventListener('keydown', keyGo); document.getElementById('screen-versus')?.removeEventListener('click', stageGo); }
    function stageGo(e){ if (e.target && e.target.id==='vs-fight-btn') return; go(); }
    if (btn) btn.addEventListener('click', go);
    document.addEventListener('keydown', keyGo);
    // tap anywhere on the VS screen also starts
    document.getElementById('screen-versus')?.addEventListener('click', stageGo);
  }

  // ── fight ────────────────────────────────────────────────────────────────────
  function bindFightControls() {
    const map = { 'touch-up':'up','touch-down':'down','touch-left':'left','touch-right':'right',
      'touch-a':'attack','touch-b':'special','touch-x':'dodge','touch-y':'interact' };
    Object.entries(map).forEach(([id,action])=>{
      const btn=document.getElementById(id);
      if (!btn || btn.dataset.vsbound) return;
      btn.dataset.vsbound='1';
      btn.addEventListener('touchstart',e=>{e.preventDefault();InputManager.setTouch(action,true);},{passive:false});
      btn.addEventListener('touchend',  e=>{e.preventDefault();InputManager.setTouch(action,false);},{passive:false});
      btn.addEventListener('mousedown', ()=>InputManager.setTouch(action,true));
      btn.addEventListener('mouseup',   ()=>InputManager.setTouch(action,false));
    });
  }

  function launchFight(rung) {
    show('screen-gameplay');
    // hide quest HUD/pause; versus draws its own HUD on the canvas
    const hud = document.getElementById('game-overlay-hud'); if (hud) hud.style.display='none';
    const ov  = document.getElementById('game-overlay');     if (ov)  ov.style.display='none';
    const ps  = document.getElementById('pause-screen');     if (ps)  ps.classList.remove('active');

    const canvas = document.getElementById('gameCanvas');
    if (!canvas) return;
    if (typeof InputManager !== 'undefined') InputManager.init();
    bindFightControls();

    const diff = rung.final ? 3 : rung.boss ? 2.4 : Math.min(2.2, 1 + run.idx*0.3);

    VersusEngine.start(canvas, {
      p1CharId: run.playerCharId,
      p2CharId: rung.opp,
      stage: rung.stage,
      difficulty: diff,
      onMatchEnd: (playerWon) => onFightEnd(rung, playerWon),
    });
  }

  function onFightEnd(rung, playerWon) {
    if (playerWon) {
      // reward status points
      try { SaveSystem.addPts(rung.boss ? 500 : 250); } catch(_){}
      showResult(true, rung);
    } else {
      showResult(false, rung);
    }
  }

  // ── result / dialogue screens ────────────────────────────────────────────────
  function showResult(won, rung) {
    ensureScreens();
    show('screen-result');
    const box = document.getElementById('result-box');
    const L = ladder();
    const isLast = run.idx >= L.length - 1;
    if (!box) return;

    if (won) {
      box.innerHTML = `
        <div class="result-win">VICTORY</div>
        <div class="result-flavor">${rung.win||''}</div>
        <button class="vs-fight-btn" id="result-next">${isLast ? '👑 SEE ENDING' : '▶ NEXT RIVAL'}</button>`;
      document.getElementById('result-next').onclick = () => {
        run.idx++;
        if (run.idx >= L.length) showEnding(true);
        else nextRung();
      };
    } else {
      box.innerHTML = `
        <div class="result-lose">DEFEATED</div>
        <div class="result-flavor">The night doesn't wait. Run it back.</div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;margin-top:18px">
          <button class="vs-fight-btn" id="result-retry">↺ RETRY</button>
          <button class="back-btn" id="result-quit">EXIT TO MENU</button>
        </div>`;
      document.getElementById('result-retry').onclick = () => nextRung();
      document.getElementById('result-quit').onclick  = () => { VersusEngine.stop(); HitgearOS.openGameMenu(); };
    }
  }

  function showEnding() {
    ensureScreens();
    show('screen-result');
    const p = charById(run.playerCharId);
    const box = document.getElementById('result-box');
    if (!box) return;
    box.innerHTML = `
      <div class="result-win" style="color:#ffd700">YOU RUN THE NIGHT</div>
      <div class="ending-portrait" style="color:${p.color||'#ffd700'};border-color:${p.color||'#ffd700'};box-shadow:0 0 30px ${p.color||'#ffd700'}88">${p.emoji||'👑'}</div>
      <div class="result-flavor" style="max-width:520px">
        From the line outside CAFE 8FIFTY to KT's own stage — ${p.shortName||p.name} cleared
        every rival in the city. Predator Pete, Agent Snow, the whole strip.
        Tonight you're not waiting on the list. You ARE the list.
      </div>
      <div class="ending-title">★ HITMANS VIP — LEGEND STATUS ★</div>
      <button class="vs-fight-btn" id="ending-done">RETURN TO HITGEAR OS</button>`;
    document.getElementById('ending-done').onclick = () => { VersusEngine.stop(); HitgearOS.openOSMenu(); };
    try { SaveSystem.addPts(2000); } catch(_){}
  }

  return { startStory, startArcade };
})();

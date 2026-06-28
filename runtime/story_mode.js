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
  // HITMAN'S RISE — climb the whole strip, venue by venue, from the late-night
  // fuel stop all the way to KT's stage. Every rung is a real venue backdrop and
  // a canonical character. Difficulty scales with the rung index.
  const LADDER = [
    // ── ACT I — THE STREET ──────────────────────────────────────────────────
    { opp:31, venue:'QUICK HIT FUEL — LATE STOP', stage:{sky:'#040014',ground:'#060005',accent:'#ffee00',name:'QUICK HIT FUEL',bgImage:'assets/venues/qhf_exterior.png'},
      pre:['AGENT SNOW: "Scene\'s shutting down tonight. Starting with you."',
           'YOU: "Cold night for the wrong move, agent."'],
      win:'SNOW\'s case goes cold. The block stays open. Word starts to travel.' },

    { opp:4, venue:'TALLY ROW — THE STRIP', stage:{sky:'#060018',ground:'#0c0010',accent:'#ffdd00',name:'TALLY ROW EXTERIOR',bgImage:'assets/venues/tally_exterior.png'},
      pre:['FAMU MALE: "Rattler pride runs this strip. You sure you wanna walk it?"',
           'YOU: "I don\'t walk it. I own it."'],
      win:'FAMU Male tips his head. Respect. The strip opens up.' },

    { opp:3, venue:'THE ITUS PIZZA — KITCHEN RUSH', stage:{sky:'#1a0800',ground:'#0a0400',accent:'#ff4400',name:'THE ITUS PIZZA',bgImage:'assets/venues/tally_itus.png'},
      pre:['FAMU FEMALE: "Rattler rush — you can\'t keep up with me."',
           'YOU: "Watch the counter, then. This one\'s on the house."'],
      win:'FAMU Female salutes. Pizza • People • Party — and you ran it.' },

    // ── ACT II — THE VENUES ──────────────────────────────────────────────────
    { opp:13, venue:'SAMMYS STAGE — THE SHOWDOWN', stage:{sky:'#100020',ground:'#0a0010',accent:'#ffdd00',name:'SAMMYS STAGE',bgImage:'assets/venues/tally_sammys.png'},
      pre:['FSU FEMALE: "I counter everything. No move you\'ve got is new to me."',
           'YOU: "Then watch this one, gold standard."'],
      win:'The counter game breaks. Sammys crowd chants your name.' },

    { opp:12, venue:'PUBLIC HALL — CROWD CONTROL', stage:{sky:'#080018',ground:'#0a0014',accent:'#aaaaff',name:'PUBLIC HALL',bgImage:'assets/venues/tally_public_hall.png'},
      pre:['FSU MALE: "Garnet and gold runs this hall. Seminoles don\'t fold."',
           'YOU: "Open season. Let\'s see who\'s still standing."'],
      win:'Garnet and Gold hits the floor. Public Hall belongs to the night.' },

    { opp:30, venue:'13 RAVE CLUB — THE BASS DROP', stage:{sky:'#080030',ground:'#0a000f',accent:'#00ffcc',name:'13 RAVE CLUB',bgImage:'assets/venues/tally_13rave.png'},
      pre:['PREDATOR PETE: "Smooth operator works the floor. You\'re cramping it."',
           'YOU: "Your act\'s played out, Pete. Lights up."'],
      win:'PETE slithers off mid-bass-drop. 13 Rave is yours.' },

    { opp:31, venue:'THE DEN — UNDERGROUND', stage:{sky:'#0a0015',ground:'#0a0010',accent:'#8800ff',name:'THE DEN',bgImage:'assets/venues/tally_den.png'},
      pre:['AGENT SNOW: "You shouldn\'t have made it this far. Rematch. Final answer."',
           'YOU: "Cold case. Closed twice."'],
      win:'SNOW taps out for good. The Den answers to you now.' },

    { opp:12, venue:'DUKES & DIMES — HIGH STAKES', stage:{sky:'#0a0a00',ground:'#181800',accent:'#ffd700',name:'DUKES & DIMES',bgImage:'assets/venues/dukes_interior.png'},
      pre:['FSU MALE: "Double or nothing. House always wins."',
           'YOU: "Not tonight. I am the house."'],
      win:'The table flips. Dukes & Dimes folds. The hustle is yours.' },

    { opp:13, venue:'KINGDOM COME SALOON — LAST CALL', stage:{sky:'#1a1000',ground:'#0a0500',accent:'#ffaa00',name:'KINGDOM COME SALOON',bgImage:'assets/venues/kingdom_come_exterior.png'},
      pre:['FSU FEMALE: "Last call, hotshot. Country brawlers don\'t miss."',
           'YOU: "Then it\'s a good thing I never do."'],
      win:'Last call rings out. Kingdom Come Saloon bows to the night.' },

    // ── ACT III — THE GAUNTLET (HOME TURF — CAFE 8FIFTY / HVAS) ──────────────
    { opp:22, venue:'CAFE 8FIFTY — THE DOOR', stage:{sky:'#10001a',ground:'#08000f',accent:'#7700cc',name:'CAFE 8FIFTY ENTRY',bgImage:'assets/venues/cafe8fifty_exterior.png'}, boss:true,
      pre:['ENTRY LINE DISRUPTOR: "You\'re not on the list. This door is mine."',
           'ENTRY LINE DISRUPTOR: "VIP Locked. Walk away — or get locked out."',
           'YOU: "I built the list. Now move."'],
      win:'The velvet rope drops. The door swings open. VIP status — earned in blood.' },

    { opp:21, venue:'HVAS — THE ENTRY', stage:{sky:'#12000a',ground:'#08000f',accent:'#cc0022',name:'HITMANS VIP AFTER SPOT',bgImage:'assets/venues/cafe8fifty_exterior.png'}, boss:true,
      pre:['BIG SOULJA: "Nobody passes me. Not for status. Not for nothing."',
           'YOU: "Then I earn the entry the hard way."'],
      win:'BIG SOULJA steps aside. The VIP room opens. One door left.' },

    { opp:20, venue:'CAFE 8FIFTY — THE STAGE', stage:{sky:'#150000',ground:'#0a0000',accent:'#ff0000',name:'KT — FINAL BOSS',bgImage:'assets/venues/hvas_interior.png'}, boss:true, final:true,
      pre:['KT: "This is my house. The owner. The chef. The producer."',
           'KT: "Prove you belong — or get the shutdown."',
           'YOU: "I came to run the night. Let\'s go."'],
      win:'KT nods. Respect earned. You are a certified HITMANS VIP LEGEND.' },
  ];

  let run = null; // { playerCharId, idx, mode }
  let playerName = '';

  function loadName() {
    if (playerName) return playerName;
    try { playerName = localStorage.getItem('hvas_player_name') || ''; } catch(_){}
    return playerName;
  }
  function saveName(n) {
    playerName = (n||'').toUpperCase().slice(0,12);
    try { localStorage.setItem('hvas_player_name', playerName); } catch(_){}
  }

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
    if (!document.getElementById('screen-name')) {
      const n = document.createElement('div');
      n.id = 'screen-name'; n.className = 'screen'; n.style.display = 'none';
      n.innerHTML = `
        <div class="name-box">
          <div class="name-title">ENTER YOUR NAME</div>
          <div class="name-sub">THIS IS HOW THE NIGHT WILL KNOW YOU</div>
          <input id="name-input" class="name-input" maxlength="12" autocomplete="off"
                 spellcheck="false" placeholder="HITMAN" />
          <div class="name-row">
            <button class="vs-fight-btn" id="name-go">▶ ENTER THE NIGHT</button>
            <button class="back-btn" id="name-back">BACK</button>
          </div>
        </div>`;
      host.appendChild(n);
    }
  }

  // ── name entry ────────────────────────────────────────────────────────────────
  function promptName(cb) {
    ensureScreens();
    show('screen-name');
    const input = document.getElementById('name-input');
    const go = document.getElementById('name-go');
    const back = document.getElementById('name-back');
    if (input) { input.value = loadName(); setTimeout(()=>{ try{input.focus();}catch(_){} }, 60); }
    const finish = () => {
      const v = (input && input.value.trim()) || 'HITMAN';
      saveName(v);
      cleanup();
      cb();
    };
    const onKey = (e) => { if (e.key === 'Enter') { e.preventDefault(); finish(); } };
    function cleanup() {
      go && go.removeEventListener('click', finish);
      back && back.removeEventListener('click', toMenu);
      input && input.removeEventListener('keydown', onKey);
    }
    function toMenu() { cleanup(); try { HitgearOS.openGameMenu(); } catch(_){} }
    if (go) go.addEventListener('click', finish);
    if (back) back.addEventListener('click', toMenu);
    if (input) input.addEventListener('keydown', onKey);
  }

  function show(id) { HitgearOS.showScreen(id); }
  function charById(id){ return (window.CHARACTERS||[]).find(c=>c.id===id) || {}; }

  // ── entry points ────────────────────────────────────────────────────────────
  function startStory() {
    ensureScreens();
    promptName(() => {
      HitgearOS.openCharSelect(charId => {
        run = { playerCharId: charId, idx: 0, mode: 'story' };
        nextRung();
      });
    });
  }

  // Arcade difficulty → number of fights before/including the boss climb.
  const ARCADE_DIFF = {
    novice: { fights: 5,  label: 'NOVICE', bosses: 1, color: '#46e24a' },
    medium: { fights: 8,  label: 'MEDIUM', bosses: 2, color: '#ffd23f' },
    hard:   { fights: 12, label: 'HARD',   bosses: 3, color: '#ff3344' },
  };

  function startArcade() {
    ensureScreens();
    promptName(() => {
      promptDifficulty(diff => {
        HitgearOS.openCharSelect(charId => {
          run = { playerCharId: charId, idx: 0, mode: 'arcade', diff,
            ladder: buildArcadeLadder(diff) };
          nextRung();
        }, { allUnlocked: true });   // Arcade: full roster selectable
      });
    });
  }

  // Streets-of-Rage arcade ladder: N street fights across ALL stages, then the
  // boss gauntlet. Novice 5 / Medium 8 / Hard 12. Secret bosses unlock when the
  // player's entered name is a code (see SECRET_CODES) — adds a hidden finale.
  const SECRET_CODES = { 'RUNTHENIGHT':20, 'AFTERSPOT':21, 'HITMAN23':22 };
  function buildArcadeLadder(diffKey) {
    const d = ARCADE_DIFF[diffKey] || ARCADE_DIFF.novice;
    const regular = LADDER.filter(r => !r.boss);
    const bosses  = LADDER.filter(r => r.boss);
    // shuffle the regular pool, repeat to fill the required street-fight count
    const pool = regular.slice();
    for (let i=pool.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [pool[i],pool[j]]=[pool[j],pool[i]]; }
    const streetCount = Math.max(1, d.fights - d.bosses);
    const street = [];
    for (let i=0;i<streetCount;i++) street.push(pool[i % pool.length]);
    // boss gauntlet — last d.bosses bosses, in order, as the climax
    const gauntlet = bosses.slice(-d.bosses);
    // SECRET: if the player's name matches a code, splice in a secret boss finale
    const secretId = SECRET_CODES[(loadName()||'').toUpperCase().replace(/[^A-Z0-9]/g,'')];
    const secret = secretId ? LADDER.filter(r => r.boss && r.opp === secretId) : [];
    return street.concat(gauntlet, secret);
  }

  // lightweight difficulty picker overlay
  function promptDifficulty(cb) {
    let ov = document.getElementById('arcade-diff');
    if (ov) ov.remove();
    ov = document.createElement('div');
    ov.id = 'arcade-diff';
    ov.style.cssText = 'position:absolute;inset:0;z-index:40;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;background:rgba(5,0,12,0.92)';
    const btns = Object.entries(ARCADE_DIFF).map(([k,d]) =>
      `<button class="back-btn" data-k="${k}" style="min-width:220px;color:${d.color};border-color:${d.color};font-size:16px;letter-spacing:3px">${d.label} — ${d.fights} FIGHTS</button>`).join('');
    ov.innerHTML = `<div style="font-family:'Orbitron',sans-serif;font-size:clamp(18px,4vw,30px);font-weight:900;color:#ffd700;letter-spacing:4px;text-shadow:0 0 16px #ffd700">SELECT DIFFICULTY</div>
      ${btns}
      <div style="font-family:'Rajdhani',sans-serif;font-size:12px;color:#888;max-width:340px;text-align:center">More fights before the boss gauntlet. Enter a code as your name to unlock secret bosses.</div>`;
    (document.getElementById('screen-area')||document.body).appendChild(ov);
    ov.querySelectorAll('button[data-k]').forEach(b =>
      b.addEventListener('click', () => { const k=b.dataset.k; ov.remove(); cb(k); }));
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
    const port = (id, ch)=>{ const e=document.getElementById(id); if(!e) return;
      e.style.color=ch.color||'#fff'; e.style.borderColor=ch.color||'#fff';
      e.style.boxShadow=`0 0 28px ${ch.color||'#fff'}99, inset 0 0 18px ${ch.color||'#fff'}44`;
      const src = (window.SpriteSystem && SpriteSystem.portraitSrc) ? SpriteSystem.portraitSrc(ch.id) : null;
      if (src) { e.innerHTML = `<img src="${src}" alt="${ch.shortName||ch.name||''}" style="width:100%;height:100%;object-fit:contain;image-rendering:auto;filter:drop-shadow(0 0 10px ${ch.color||'#fff'}cc)">`; }
      else { e.textContent = ch.emoji||'🥊'; }
    };
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
    // START button (shell + on-screen) pauses the fight
    ['sfbtn-start','touch-start'].forEach(id=>{
      const b=document.getElementById(id);
      if (!b || b.dataset.vspause) return;
      b.dataset.vspause='1';
      b.addEventListener('click', ()=>{ if (typeof VersusEngine!=='undefined') VersusEngine.togglePause(); });
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
      playerName: loadName(),
      onMatchEnd: (playerWon) => onFightEnd(rung, playerWon),
      onQuit: () => { try { HitgearOS.openGameMenu(); } catch(_){} },
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
    const who = loadName() || (p.shortName||p.name);
    box.innerHTML = `
      <div class="result-win" style="color:#ffd700">YOU RUN THE NIGHT</div>
      <div class="ending-portrait" style="color:${p.color||'#ffd700'};border-color:${p.color||'#ffd700'};box-shadow:0 0 30px ${p.color||'#ffd700'}88">${p.emoji||'👑'}</div>
      <div class="result-flavor" style="max-width:520px">
        From the line outside CAFE 8FIFTY to KT's own stage — ${who} cleared
        every rival in the city. Predator Pete, Agent Snow, the whole strip.
        Tonight you're not waiting on the list. You ARE the list.
      </div>
      <div class="ending-title">★ ${who} — HITMANS VIP LEGEND STATUS ★</div>
      <button class="vs-fight-btn" id="ending-done">RETURN TO HITGEAR OS</button>`;
    document.getElementById('ending-done').onclick = () => { VersusEngine.stop(); HitgearOS.openOSMenu(); };
    try { SaveSystem.addPts(2000); } catch(_){}
  }

  return { startStory, startArcade };
})();

'use strict';

// ── MUSIC ENGINE ─────────────────────────────────────────────────────────────
const MusicEngine = (() => {
  const TRACKS = [
    'assets/audio/track01.mp3','assets/audio/track02.mp3','assets/audio/track03.mp3',
    'assets/audio/track04.mp3','assets/audio/track05.mp3','assets/audio/track06.mp3',
  ];
  let audio = null, trackIdx = 0, muted = false, started = false;

  function _load(idx) {
    if (!audio) {
      audio = new Audio();
      audio.volume = 0.55;
      audio.addEventListener('ended', () => next());
      audio.addEventListener('error', () => next());
    }
    const track = TRACKS[idx % TRACKS.length];
    audio.src = track;
    audio.load();
  }

  function start() {
    if (started) return;
    started = true;
    const save = (typeof SaveSystem !== 'undefined' && SaveSystem.load()) || {};
    muted = save.settings && save.settings.music === false;
    _load(trackIdx);
    if (!muted) audio.play().catch(() => {});
  }

  function next() {
    trackIdx = (trackIdx + 1) % TRACKS.length;
    _load(trackIdx);
    if (!muted) audio.play().catch(() => {});
  }

  function setMuted(val) {
    muted = val;
    if (!audio) return;
    if (muted) { audio.pause(); }
    else { if (!started) start(); else audio.play().catch(() => {}); }
  }

  function resumeOnInteraction() {
    if (!started) return;
    if (!muted && audio && audio.paused) audio.play().catch(() => {});
  }

  document.addEventListener('click',     resumeOnInteraction, { once: false });
  document.addEventListener('touchstart', resumeOnInteraction, { once: false });

  return { start, next, setMuted, get muted() { return muted; } };
})();

const HitgearOS = (() => {
  let currentScreen = 'screen-boot';
  let selectedCharId = 3;
  let selectedVenueId = 1;
  let selectedOsIcon = 0;
  let clockInterval = null;

  // ──── SCREEN MANAGEMENT ────
  function showScreen(id, opts = {}) {
    // Stop sprite preview animation when leaving char select
    if (typeof _spriteAnimRAF !== 'undefined' && _spriteAnimRAF) {
      cancelAnimationFrame(_spriteAnimRAF);
      _spriteAnimRAF = null;
    }
    document.querySelectorAll('.screen').forEach(s => {
      s.classList.remove('active');
      s.style.display = 'none';
    });
    const next = document.getElementById(id);
    if (!next) return;
    next.style.display = 'flex';
    next.classList.add('active');
    if (!opts.noFade) next.classList.add('fade-in');
    setTimeout(() => next.classList.remove('fade-in'), 700);
    currentScreen = id;
  }

  // ──── BOOT SEQUENCE ────
  function boot() {
    showScreen('screen-boot');
    const bar = document.getElementById('boot-bar');
    const loadText = document.getElementById('boot-loading-text');
    const messages = [
      'INITIALIZING HITGEAR OS...',
      'LOADING NIGHTLIFE DATABASE...',
      'SYNCING VIP ROSTER...',
      'CONNECTING TO AFTER SPOT...',
      'SYSTEM READY.'
    ];
    let pct = 0, msgIdx = 0;
    const tick = setInterval(() => {
      pct += 1 + Math.random() * 3;
      if (pct > 100) pct = 100;
      if (bar) bar.style.width = pct + '%';
      if (typeof LoadingScreen !== 'undefined') LoadingScreen.setProgress(pct / 100);

      const newMsgIdx = Math.floor((pct / 100) * messages.length);
      if (newMsgIdx !== msgIdx && newMsgIdx < messages.length) {
        msgIdx = newMsgIdx;
        if (loadText) loadText.textContent = messages[msgIdx];
      }
      if (pct >= 100) {
        clearInterval(tick);
        MusicEngine.start();
        setTimeout(() => openOSMenu(), 600);
      }
    }, 40);

    // Preload all venue backgrounds and character sprites in the background
    setTimeout(() => {
      if (typeof AssetLoader !== 'undefined' && window.VENUES) {
        window.VENUES.forEach(v => { if (v.bgImage) AssetLoader.get(v.bgImage); });
      }
      if (typeof SpriteSystem !== 'undefined' && window.CHARACTERS) {
        window.CHARACTERS.forEach(c => SpriteSystem.preload(c.id));
        if (SpriteSystem.preloadNPCs) SpriteSystem.preloadNPCs();
      }
    }, 200);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('service-worker.js')
        .catch(() => {});
    }
  }

  // ──── OS MENU ────
  function openOSMenu() {
    showScreen('screen-os');
    startClock();
    renderOSIcons();
    setupOSNavigation();
  }

  function startClock() {
    const el = document.getElementById('os-time');
    if (!el) return;
    const update = () => {
      const now = new Date();
      const h = now.getHours(), m = now.getMinutes();
      el.textContent = `${h % 12 || 12}:${m.toString().padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
    };
    update();
    if (clockInterval) clearInterval(clockInterval);
    clockInterval = setInterval(update, 10000);
  }

  function renderOSIcons() {
    const grid = document.getElementById('os-icon-grid');
    if (!grid) return;
    const icons = [
      { label: 'STORY\nMODE', emblem: 'assets/ui/elements/frames_emblems/frames_emblems_002.png', action: () => StoryMode.startStory() },
      { label: 'ARCADE\nFIGHT', emblem: 'assets/ui/elements/frames_emblems/frames_emblems_003.png', action: () => StoryMode.startArcade() },
      { label: 'HITMANS VIP\nQUEST', emblem: 'assets/ui/elements/frames_emblems/frames_emblems_011.png', action: () => openGameMenu() },
      { label: 'VENUES\n& SPOTS', emblem: 'assets/ui/elements/frames_emblems/frames_emblems_014.png', action: () => openVenueMap() },
      { label: 'VIP\nSTATUS', emblem: 'assets/ui/elements/frames_emblems/frames_emblems_013.png', action: () => openVIPStatus() },
      { label: 'LIP SYNC\nBINGO', emblem: 'assets/ui/elements/frames_emblems/frames_emblems_005.png', action: () => openBingo() }
    ];
    grid.innerHTML = '';
    icons.forEach((ic, i) => {
      const div = document.createElement('div');
      div.className = 'os-icon' + (i === selectedOsIcon ? ' selected' : '');
      div.innerHTML = `<div class="os-icon-img"><img src="${ic.emblem}" style="width:100%;height:100%;object-fit:contain;image-rendering:auto" alt=""></div><div class="os-icon-label">${ic.label.replace('\n','<br>')}</div>`;
      div.addEventListener('click', ic.action);
      div.addEventListener('mouseenter', () => {
        document.querySelectorAll('.os-icon').forEach(d => d.classList.remove('selected'));
        div.classList.add('selected');
        selectedOsIcon = i;
      });
      grid.appendChild(div);
    });
  }

  function setupOSNavigation() {
    document.addEventListener('keydown', osKeyHandler);
  }

  function teardownOSNavigation() {
    document.removeEventListener('keydown', osKeyHandler);
  }

  function osKeyHandler(e) {
    if (currentScreen !== 'screen-os') return;
    const icons = document.querySelectorAll('.os-icon');
    const actions = [() => StoryMode.startStory(), () => StoryMode.startArcade(), openGameMenu, openVenueMap, openVIPStatus, openBingo];
    const maxIdx = actions.length - 1;
    if (e.key === 'ArrowRight' || e.key === 'd') { selectedOsIcon = Math.min(maxIdx, selectedOsIcon + 1); }
    if (e.key === 'ArrowLeft'  || e.key === 'a') { selectedOsIcon = Math.max(0, selectedOsIcon - 1); }
    if (e.key === 'ArrowDown'  || e.key === 's') { selectedOsIcon = Math.min(maxIdx, selectedOsIcon + 2); }
    if (e.key === 'ArrowUp'    || e.key === 'w') { selectedOsIcon = Math.max(0, selectedOsIcon - 2); }
    if (e.key === 'Enter' || e.key === 'z' || e.key === 'Z') { actions[selectedOsIcon]?.(); return; }
    icons.forEach((ic, i) => ic.classList.toggle('selected', i === selectedOsIcon));
    e.preventDefault();
  }

  // ──── GAME MENU ────
  function openGameMenu() {
    teardownOSNavigation();
    showScreen('screen-game-menu');
    renderGameMenu();
  }

  let gameMenuIdx = 0;
  const gameMenuItems = [
    { label: 'STORY MODE (FIGHTER)', emblem: 'assets/ui/elements/frames_emblems/frames_emblems_000.png', action: () => StoryMode.startStory() },
    { label: 'ARCADE FIGHT',         emblem: 'assets/ui/elements/frames_emblems/frames_emblems_001.png', action: () => StoryMode.startArcade() },
    { label: 'CONTINUE QUEST', emblem: 'assets/ui/elements/frames_emblems/frames_emblems_002.png', action: () => continueQuest() },
    { label: 'NEW GAME',       emblem: 'assets/ui/elements/frames_emblems/frames_emblems_003.png', action: () => newGame() },
    { label: 'VENUE MAP',      emblem: 'assets/ui/elements/frames_emblems/frames_emblems_004.png', action: () => openVenueMap() },
    { label: 'VIP STATUS',     emblem: 'assets/ui/elements/frames_emblems/frames_emblems_005.png', action: () => openVIPStatus() },
    { label: 'LIP SYNC BINGO', emblem: 'assets/ui/elements/frames_emblems/frames_emblems_006.png', action: () => openBingo() },
    { label: 'OPTIONS',        emblem: 'assets/ui/elements/frames_emblems/frames_emblems_007.png', action: () => openOptions() },
    { label: 'EXIT TO OS',     emblem: 'assets/ui/elements/frames_emblems/frames_emblems_008.png', action: () => openOSMenu() }
  ];

  function renderGameMenu() {
    const list = document.getElementById('game-menu-list');
    if (!list) return;
    const save = SaveSystem.load();
    list.innerHTML = '';
    gameMenuItems.forEach((item, i) => {
      const div = document.createElement('div');
      div.className = 'game-menu-item' + (i === gameMenuIdx ? ' selected' : '');
      if (item.label === 'CONTINUE QUEST' && !SaveSystem.hasSave()) {
        div.style.opacity = '0.35'; div.style.cursor = 'default';
      }
      div.innerHTML =
        `<img src="${item.emblem}" ` +
        `style="width:28px;height:28px;vertical-align:middle;margin-right:10px;object-fit:contain;image-rendering:auto;` +
        `filter:drop-shadow(0 0 6px #ffd70066)" alt="">` +
        `<span style="vertical-align:middle">${item.label}</span>`;
      div.addEventListener('click', () => { gameMenuIdx = i; renderGameMenu(); item.action(); });
      div.addEventListener('mouseenter', () => { gameMenuIdx = i; renderGameMenu(); });
      list.appendChild(div);
    });
    renderGamePreview();
  }

  function renderGamePreview() {
    const preview = document.getElementById('game-preview');
    if (!preview) return;
    const save = SaveSystem.load();
    const venue = save ? (window.VENUES || []).find(v => v.id === save.currentVenueId) : null;
    const tier = save ? VIPStatus.getTier(save.statusPts || 0) : { name: 'NEW MEMBER', color: '#888' };
    preview.innerHTML = `
      <div style="padding:20px;height:100%;display:flex;flex-direction:column;justify-content:space-between;">
        <div>
          <div style="display:flex;align-items:center;gap:14px;margin-bottom:4px">
            <img src="assets/ui/hvas_logo.png" style="width:clamp(52px,8vw,80px);height:auto;filter:drop-shadow(0 0 14px #ffd70088)" alt="HVAS">
            <div style="font-family:'Orbitron',sans-serif;font-size:clamp(14px,2.5vw,26px);font-weight:900;line-height:1.1">
              <span style="color:#e8d5ff">HITMANS</span>
              <span style="color:#ff00aa;text-shadow:0 0 12px #ff00aa"> VIP</span>
              <span style="display:block;font-size:0.45em;color:#ffd700;letter-spacing:6px;margin-top:4px">QUEST</span>
            </div>
          </div>
          <div style="margin-top:12px;font-size:13px;color:#ccbbee;font-family:'Rajdhani',sans-serif;line-height:1.5">
            Start outside Cafe8Fifty. Earn status. Unlock venues. Run the night.
          </div>
        </div>
        <div style="font-family:'Orbitron',sans-serif;font-size:11px;letter-spacing:2px">
          <div style="color:${tier.color};margin-bottom:6px">★ ${tier.name}</div>
          ${venue ? `<div style="color:#ff00aa">LAST VENUE: ${venue.shortName}</div>` : '<div style="color:#666">NO SAVE — START NEW GAME</div>'}
        </div>
      </div>`;
  }

  document.addEventListener('keydown', e => {
    if (currentScreen !== 'screen-game-menu') return;
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
      gameMenuIdx = Math.max(0, gameMenuIdx - 1);
      renderGameMenu(); e.preventDefault();
    } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
      gameMenuIdx = Math.min(gameMenuItems.length - 1, gameMenuIdx + 1);
      renderGameMenu(); e.preventDefault();
    } else if (e.key === 'Enter' || e.key === 'z') {
      gameMenuItems[gameMenuIdx]?.action(); e.preventDefault();
    } else if (e.key === 'Escape' || e.key === 'b') {
      openOSMenu(); e.preventDefault();
    }
  });

  // ──── CHAR SELECT ────
  function openCharSelect(onSelect) {
    showScreen('screen-char-select');
    renderCharSelect(onSelect);
  }

  function renderCharSelect(onSelect) {
    const grid = document.getElementById('char-grid');
    if (!grid || !window.CHARACTERS) return;
    grid.innerHTML = '';

    const save = SaveSystem.load() || SaveSystem.defaults();
    const pts  = save.statusPoints || 0;

    // Points label
    const ptsEl = document.getElementById('cs-pts-label');
    if (ptsEl) ptsEl.textContent = '⭐ ' + pts + ' STATUS PTS';

    // Back button
    const backBtn = document.getElementById('cs-back-btn');
    if (backBtn) {
      backBtn.onclick = () => HitgearOS.openGameMenu();
    }

    // Default selection
    if (!window.CHARACTERS.find(c => c.id === selectedCharId)) {
      selectedCharId = window.CHARACTERS[0]?.id || 1;
    }

    window.CHARACTERS.forEach(ch => {
      const locked = (ch.unlockPts || 0) > pts;
      const card = document.createElement('div');
      card.className = 'char-card' + (ch.id === selectedCharId ? ' active' : '') + (locked ? ' locked-char' : '');
      const cid = `cs-thumb-${ch.id}`;
      card.innerHTML = `
        <canvas id="${cid}" width="60" height="70" style="width:60px;height:70px;image-rendering:pixelated;display:block;margin:0 auto"></canvas>
        <div class="char-name">${ch.shortName || ch.name}</div>
        ${locked ? '<div class="char-locked">🔒</div>' : ''}`;

      card.addEventListener('click', () => {
        if (locked) return;
        selectedCharId = ch.id;
        _updateCharPreview(ch, onSelect);
        document.querySelectorAll('.char-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
      });
      card.addEventListener('dblclick', () => {
        if (locked) return;
        selectedCharId = ch.id;
        _doFight(ch, onSelect);
      });
      grid.appendChild(card);
    });

    // Animate idle thumbnails on the grid
    _startGridThumbAnim();

    // Show preview for current selection
    const selected = window.CHARACTERS.find(c => c.id === selectedCharId);
    if (selected) _updateCharPreview(selected, onSelect);
  }

  let _gridThumbRAF = null;
  let _gridThumbT = 0;
  let _gridThumbLast = 0;
  function _startGridThumbAnim() {
    if (_gridThumbRAF) { cancelAnimationFrame(_gridThumbRAF); _gridThumbRAF = null; }
    function loop(ts) {
      const dt = (ts - (_gridThumbLast || ts)) / 1000;
      _gridThumbLast = ts;
      _gridThumbT += dt;
      (window.CHARACTERS || []).forEach(ch => {
        const cv = document.getElementById(`cs-thumb-${ch.id}`);
        if (!cv) return;
        const c = cv.getContext('2d');
        c.clearRect(0, 0, cv.width, cv.height);
        let drawn = false;
        if (typeof SpriteSystem !== 'undefined') {
          drawn = SpriteSystem.drawAnimGrounded(c, ch.id, 'idle', _gridThumbT, cv.width * 0.5, cv.height * 0.98, cv.height * 0.96, { facing: 1 });
        }
        if (!drawn && typeof CharRenderer !== 'undefined') {
          CharRenderer.draw(c, ch.id, 'idle', _gridThumbT, cv.width * 0.5, cv.height * 0.95, cv.width * 0.85, cv.height * 0.9, 1, {});
        }
      });
      _gridThumbRAF = requestAnimationFrame(loop);
    }
    _gridThumbRAF = requestAnimationFrame(loop);
  }

  let _spriteAnimRAF = null;
  let _spriteAnimT = 0;
  let _spriteLastTime = 0;
  function _startSpritePreview(charId, charColor) {
    if (_spriteAnimRAF) { cancelAnimationFrame(_spriteAnimRAF); _spriteAnimRAF = null; }
    const cv = document.getElementById('cs-sprite-canvas');
    if (!cv) return;
    const c = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    _spriteAnimT = 0;
    function loop(ts) {
      const dt = (ts - (_spriteLastTime || ts)) / 1000;
      _spriteLastTime = ts;
      _spriteAnimT += dt;
      c.clearRect(0, 0, W, H);
      // Background glow
      const grd = c.createRadialGradient(W/2, H*0.6, 10, W/2, H*0.6, W*0.55);
      grd.addColorStop(0, (charColor || '#ff00aa') + '44');
      grd.addColorStop(1, 'transparent');
      c.fillStyle = grd;
      c.fillRect(0, 0, W, H);
      // Try SpriteSystem first
      let drawn = false;
      if (typeof SpriteSystem !== 'undefined') {
        drawn = SpriteSystem.drawAnimGrounded(c, charId, 'idle', _spriteAnimT, W*0.5, H*0.96, H*0.92, { facing: 1 });
      }
      // Fallback: CharRenderer humanoid
      if (!drawn && typeof CharRenderer !== 'undefined') {
        CharRenderer.draw(c, charId, 'idle', _spriteAnimT, W*0.5, H*0.92, W*0.7, H*0.85, 1, {});
        drawn = true;
      }
      // Glowing border ring (canvas, no opaque sheet overlay)
      c.save();
      c.strokeStyle = charColor || '#ff00aa';
      c.lineWidth = 3;
      c.shadowColor = charColor || '#ff00aa';
      c.shadowBlur = 18;
      c.strokeRect(2, 2, W - 4, H - 4);
      c.restore();
      _spriteAnimRAF = requestAnimationFrame(loop);
    }
    _spriteAnimRAF = requestAnimationFrame(loop);
  }

  function _updateCharPreview(ch, onSelect) {
    const el = id => document.getElementById(id);
    // Start animated sprite preview
    _startSpritePreview(ch.id, ch.color);
    if (el('cs-preview-name'))  el('cs-preview-name').textContent  = ch.shortName || ch.name || '';
    if (el('cs-preview-style')) el('cs-preview-style').textContent = ch.style || ch.desc || '';

    // Stats
    const statsEl = el('cs-preview-stats');
    if (statsEl) {
      statsEl.innerHTML = [
        { key:'SPD', val: ch.spd || 70, cls:'spd' },
        { key:'STR', val: ch.str || 70, cls:'str' },
        { key:'DEF', val: ch.def || 70, cls:'def' },
      ].map(s => `<div class="cs-stat-row">
        <span class="cs-stat-label">${s.key}</span>
        <div class="cs-stat-track"><div class="cs-stat-fill ${s.cls}" style="width:${s.val}%"></div></div>
        <span class="cs-stat-val">${s.val}</span>
      </div>`).join('');
    }

    // Move list
    const movesEl = el('cs-preview-moves');
    if (movesEl) {
      const moves = [
        { key: 'L',          name: ch.comboString ? ch.comboString + ' combo' : 'Light combo' },
        { key: 'H',          name: 'Heavy strike' },
        { key: 'BLK',        name: 'Guard / Block' },
        { key: '→ + SP',     name: ch.special || 'Projectile' },
        { key: '↓ + SP',     name: 'Rising attack' },
        { key: '← + SP',     name: 'Lunge dash' },
        { key: '↑ + SP',     name: (ch.super1 || 'FINISHER') + ' (full meter)' },
      ];
      movesEl.innerHTML = `<div class="cs-move-title">MOVE LIST</div>` +
        moves.map(m => `<div class="cs-move-row"><span class="cs-move-key">${m.key}</span><span>${m.name}</span></div>`).join('');
    }

    // Fight button
    const fightBtn = el('cs-fight-btn');
    if (fightBtn) {
      fightBtn.style.display = 'block';
      fightBtn.style.background = `linear-gradient(135deg, ${ch.color || '#ffd700'}, #ff8800)`;
      fightBtn.onclick = () => _doFight(ch, onSelect);
    }
  }

  function _doFight(ch, onSelect) {
    if (!onSelect) return;
    // VS Flash then callback
    _showVSFlash(ch, () => {
      onSelect(ch.id);
    });
  }

  function _showVSFlash(p1Char, callback) {
    const cpuList = (window.CHARACTERS || []).filter(c => c.id !== p1Char.id).slice(0, 8);
    const cpuChar = cpuList[Math.floor(Math.random() * cpuList.length)] || p1Char;

    const flash = document.getElementById('vs-flash');
    if (!flash) { callback(); return; }

    const p1El = document.getElementById('vs-p1-panel');
    const p2El = document.getElementById('vs-p2-panel');

    function _buildPanel(el, ch, label, facing) {
      if (!el) return;
      el.innerHTML = '';
      // Sprite canvas
      const cv = document.createElement('canvas');
      cv.width = 260; cv.height = 320;
      cv.style.cssText = 'width:200px;height:240px;image-rendering:pixelated';
      el.appendChild(cv);
      // Name + label
      const nameEl = document.createElement('div');
      nameEl.className = 'vs-p-name';
      nameEl.style.color = ch.color || '#ff00aa';
      nameEl.textContent = ch.shortName || ch.name;
      el.appendChild(nameEl);
      const lblEl = document.createElement('div');
      lblEl.style.cssText = 'font-size:13px;color:#aaa;letter-spacing:2px;font-family:"Orbitron",sans-serif;margin-top:4px';
      lblEl.textContent = label;
      el.appendChild(lblEl);
      // Animate
      const c = cv.getContext('2d');
      let t = 0, last = 0, raf;
      function tick(now) {
        t += (now - last) / 1000; last = now;
        c.clearRect(0, 0, cv.width, cv.height);
        const drawn = typeof SpriteSystem !== 'undefined' &&
          SpriteSystem.drawAnimGrounded(c, ch.id, 'idle', t, cv.width * 0.5, cv.height * 0.98, cv.height * 0.96, { facing });
        if (!drawn && typeof CharRenderer !== 'undefined') {
          CharRenderer.draw(c, ch.id, 'idle', t, cv.width * 0.5, cv.height * 0.95, cv.width * 0.75, cv.height * 0.9, facing, {});
        }
        raf = requestAnimationFrame(tick);
      }
      raf = requestAnimationFrame(tick);
      el._vsRAF = raf;
      el._vsStop = () => { cancelAnimationFrame(raf); };
    }

    _buildPanel(p1El, p1Char, 'PLAYER 1', 1);
    _buildPanel(p2El, cpuChar, 'CPU', -1);

    flash.style.display = 'flex';
    setTimeout(() => {
      flash.style.display = 'none';
      if (p1El && p1El._vsStop) p1El._vsStop();
      if (p2El && p2El._vsStop) p2El._vsStop();
      callback();
    }, 2200);
  }

  // ──── VENUE MAP ────
  function openVenueMap() {
    showScreen('screen-venue-map');
    renderVenueMap();
  }

  // Map venue shortName → best background image
  // CLEAN finished venue renders only. The *_pack_NN_*.png files are design /
  // assembly SPEC SHEETS (title bars, annotation panels, component callouts) —
  // never use them as backgrounds. The simple-named files are the finished,
  // label-free venue art.
  const VENUE_BG_MAP = {
    'CAFE8FIFTY':    'assets/venues/cafe8fifty_exterior.png',
    'HVAS INTERIOR': 'assets/venues/hvas_interior.png',
    'KINGDOM COME':  'assets/venues/kingdom_come_exterior.png',
    'SOCIAL GAINES': 'assets/venues/social_gaines.png',
    'SUCCESS POOL':  'assets/venues/success_pool.png',
    'TALLY ROW':     'assets/venues/tally_exterior.png',
    'THE DEN':       'assets/venues/tally_den.png',
    'THE ITUS':      'assets/venues/tally_itus.png',
    'SAMMYS STAGE':  'assets/venues/tally_sammys.png',
    'PUBLIC HALL':   'assets/venues/tally_public_hall.png',
    '13 RAVE':       'assets/venues/tally_13rave.png',
    'DUKES & DIMES': 'assets/venues/dukes_interior.png',
    'QUICK HIT':     'assets/venues/qhf_exterior.png',
  };

  function renderVenueMap() {
    const grid = document.getElementById('venue-grid');
    if (!grid || !window.VENUES) return;
    const save = SaveSystem.load() || SaveSystem.defaults();
    grid.innerHTML = '';
    window.VENUES.forEach(v => {
      const unlocked = save.unlockedVenues.includes(v.id);
      const complete = save.completedMissions.includes(v.id);
      const bg = VENUE_BG_MAP[v.shortName] || '';
      const card = document.createElement('div');
      card.className = 'venue-card ' + (unlocked ? 'unlocked' : 'locked');
      card.style.cssText += ';position:relative;overflow:hidden';
      if (bg) {
        card.style.cssText += `;background-image:url('${bg}');background-size:cover;background-position:center`;
      }
      card.innerHTML = `
        <img src="assets/ui/elements/venue_map/venue_map_001.png" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0.35;pointer-events:none;z-index:0" alt="">
        <div class="venue-card-overlay" style="position:absolute;inset:0;background:${unlocked ? 'linear-gradient(180deg,rgba(0,0,0,0.1) 0%,rgba(0,0,0,0.7) 70%)' : 'rgba(0,0,0,0.7)'};border-radius:inherit;pointer-events:none"></div>
        <img src="assets/ui/elements/venue_map/${unlocked ? 'venue_map_012' : 'venue_map_004'}.png" style="position:absolute;top:4px;right:4px;width:32px;height:32px;object-fit:contain;image-rendering:auto;z-index:2;pointer-events:none" alt="">
        <div style="position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:space-between;height:100%;padding:8px 6px 6px">
          <div class="venue-number" style="align-self:flex-start">${String(v.id).padStart(2,'0')} / ${window.VENUES.length}</div>
          <div style="flex:1;display:flex;align-items:center;justify-content:center">
            ${bg ? '' : `<div class="venue-icon">${v.emoji}</div>`}
          </div>
          <div>
            <div class="venue-name">${v.shortName}</div>
            <div style="font-size:10px;color:#ff00aa;margin-top:2px;font-family:'Orbitron',sans-serif">${v.cameraType === 'topdown' ? '▣ TOP-DOWN' : '▶ SIDE-SCROLL'}</div>
            ${complete ? '<div style="font-size:10px;color:#ffd700;margin-top:2px">✓ COMPLETE</div>' : ''}
          </div>
          <div class="venue-lock">${unlocked ? '' : '🔒'}</div>
        </div>`;
      if (unlocked) {
        card.addEventListener('click', () => startVenue(v.id));
      }
      grid.appendChild(card);
    });
  }

  // ──── VIP STATUS ────
  function openVIPStatus() {
    showScreen('screen-vip');
    renderVIPStatus();
  }

  function renderVIPStatus() {
    const save = SaveSystem.load() || SaveSystem.defaults();
    const pts = save.statusPts || 0;
    const tier = VIPStatus.getTier(pts);
    const nextTier = VIPStatus.getNextTier(pts);
    const progress = VIPStatus.getProgress(pts);
    const level = save.level || 1;

    const el = id => document.getElementById(id);
    if (el('vip-tier-name')) { el('vip-tier-name').textContent = tier.name; el('vip-tier-name').style.color = tier.color; el('vip-tier-name').style.borderColor = tier.color; el('vip-tier-name').style.boxShadow = `0 0 15px ${tier.color}88`; }
    if (el('vip-level'))     el('vip-level').textContent     = level;
    if (el('vip-pts'))       el('vip-pts').textContent       = pts.toLocaleString();
    if (el('vip-coins'))     el('vip-coins').textContent     = (save.coins || 0).toLocaleString();
    if (el('vip-stars'))     el('vip-stars').textContent     = save.stars || 0;
    if (el('vip-venues'))    el('vip-venues').textContent    = (save.unlockedVenues || [1,2]).length;
    if (el('vip-missions'))  el('vip-missions').textContent  = (save.completedMissions || []).length;
    if (el('vip-bar-fill'))  el('vip-bar-fill').style.width = (progress * 100) + '%';
    if (el('vip-next-tier')) el('vip-next-tier').textContent = nextTier ? nextTier.name : 'MAX RANK';
    if (el('vip-pts-to-next')) el('vip-pts-to-next').textContent = nextTier ? `${VIPStatus.getPtsToNext(pts).toLocaleString()} PTS TO NEXT` : '👑 YOU HAVE REACHED THE TOP';
  }

  // ──── BINGO ────
  function openBingo() {
    showScreen('screen-bingo');
    renderBingoMenu();
  }

  let bingoPlayerCardId = null;

  function renderBingoMenu() {
    const area = document.getElementById('bingo-area');
    if (!area) return;
    area.innerHTML = `
      <div style="text-align:center;margin-bottom:24px">
        <img src="assets/ui/elements/dialogue_mission/dialogue_mission_003.png" style="height:clamp(56px,9vw,80px);width:auto;image-rendering:auto;filter:drop-shadow(0 0 16px #ffd700cc);margin-bottom:8px;display:block;margin-left:auto;margin-right:auto" alt="">
      </div>
      <div style="text-align:center;margin-bottom:24px">
        <h2 class="select-header" style="color:#ffd700">🎤 LIP SYNC BINGO</h2>
        <p style="font-family:'Rajdhani',sans-serif;font-size:14px;color:#ccbbee;max-width:400px;margin:0 auto">
          Private member game mode. Min 5 players. DJ/Host calls songs — mark your card!
        </p>
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;margin-bottom:24px">
        <button class="back-btn" onclick="HitgearOS.startBingoPlayer()">🎴 JOIN AS PLAYER</button>
        <button class="back-btn" onclick="HitgearOS.startBingoHost()" style="color:#ffd700;border-color:#ffd700">👑 HOST MODE</button>
        <button class="back-btn" onclick="HitgearOS.startBingoParty()" style="color:#cc44ff;border-color:#cc44ff">🎉 PARTY MODE (2+ players)</button>
      </div>
      <div id="bingo-content"></div>`;
  }

  function startBingoPlayer() {
    BingoEngine.createSession(false);
    bingoPlayerCardId = BingoEngine.joinAsPlayer('player_' + Date.now());
    renderPlayerCard();
  }

  function startBingoHost() {
    BingoEngine.createSession(true);
    BingoEngine.enablePartyMode();
    BingoEngine.startGame();
    renderHostControl();
  }

  function startBingoParty() {
    BingoEngine.createSession(false);
    BingoEngine.enablePartyMode();
    bingoPlayerCardId = BingoEngine.joinAsPlayer('party_player_' + Date.now());
    BingoEngine.startGame();
    renderPlayerCard();
  }

  function renderPlayerCard() {
    const content = document.getElementById('bingo-content');
    if (!content) return;
    if (!bingoPlayerCardId) { bingoPlayerCardId = BingoEngine.joinAsPlayer('player_' + Date.now()); }

    const history = BingoEngine.getSongHistory();
    const lastCall = history[history.length - 1] || 'Waiting for host to call...';

    content.innerHTML = `
      <div style="text-align:center;margin-bottom:12px;font-family:'Orbitron',sans-serif;font-size:12px">
        <span style="color:#ff00aa">CURRENT CALL: </span>
        <span style="color:#ffd700">${lastCall}</span>
        <span style="color:#666;margin-left:12px">ROUND ${BingoEngine.getRound()}/3</span>
      </div>
      <div id="bingo-card-area">${BingoEngine.renderCardHTML(bingoPlayerCardId)}</div>
      <div style="margin-top:16px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
        <button class="back-btn" onclick="HitgearOS.checkBingoWin()" style="color:#ffd700;border-color:#ffd700">CHECK BINGO!</button>
        <button class="back-btn" onclick="HitgearOS.viewBingoHistory()">📋 SONG HISTORY</button>
        <button class="back-btn" onclick="HitgearOS.renderBingoMenu()" style="color:#666;border-color:#666">← BACK</button>
      </div>`;
  }

  function renderHostControl() {
    const content = document.getElementById('bingo-content');
    if (!content) return;
    const history = BingoEngine.getSongHistory();
    content.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;max-width:700px;margin:0 auto">
        <div class="neon-panel">
          <h3 style="color:#ffd700;font-family:'Orbitron',sans-serif;margin-bottom:12px">HOST CONTROLS</h3>
          <button class="back-btn" style="width:100%;margin-bottom:10px;color:#ffd700;border-color:#ffd700" onclick="HitgearOS.hostCallNext()">🎵 CALL NEXT SONG</button>
          <div style="font-family:'Orbitron',sans-serif;font-size:11px;margin-bottom:8px;color:#cc44ff">ROUND ${BingoEngine.getRound()}/3</div>
          <button class="back-btn" style="width:100%;margin-bottom:10px" onclick="HitgearOS.hostAdvanceRound()">→ ADVANCE ROUND</button>
          <input id="verify-card-input" placeholder="Enter Card ID..." style="width:100%;background:#1a003088;border:1px solid #ff00aa44;color:#e8d5ff;font-family:'Rajdhani',sans-serif;font-size:14px;padding:8px;border-radius:4px;margin-bottom:8px">
          <button class="back-btn" style="width:100%" onclick="HitgearOS.hostVerifyCard()">✓ VERIFY CARD</button>
        </div>
        <div class="neon-panel">
          <h3 style="color:#ff00aa;font-family:'Orbitron',sans-serif;margin-bottom:12px">SONG HISTORY (${history.length})</h3>
          <div style="max-height:200px;overflow-y:auto;font-family:'Rajdhani',sans-serif;font-size:13px">
            ${history.length ? history.map((s,i) => `<div style="padding:4px 0;border-bottom:1px solid #ffffff11;color:${i===history.length-1?'#ffd700':'#ccbbee'}">${i+1}. ${s}</div>`).join('') : '<div style="color:#666">No songs called yet.</div>'}
          </div>
        </div>
      </div>
      <div style="margin-top:12px;text-align:center">
        <button class="back-btn" onclick="HitgearOS.renderBingoMenu()" style="color:#666;border-color:#666">← BACK</button>
      </div>`;
  }

  let lastCalledSong = '';
  function hostCallNext() {
    const song = BingoEngine.hostCallSong();
    lastCalledSong = song || 'No more songs!';
    renderHostControl();
    showBingoCallOverlay(lastCalledSong);
  }

  function showBingoCallOverlay(song) {
    const area = document.getElementById('bingo-area');
    if (!area) return;
    let overlay = document.getElementById('bingo-call-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'bingo-call-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;background:#00000099;z-index:500;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:16px;cursor:pointer;';
      overlay.addEventListener('click', () => overlay.remove());
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = `
      <div style="font-family:'Orbitron',sans-serif;font-size:16px;color:#ff00aa;letter-spacing:4px">🎵 NOW CALLED</div>
      <div style="font-family:'Orbitron',sans-serif;font-size:clamp(20px,4vw,36px);font-weight:900;color:#ffd700;text-align:center;text-shadow:0 0 20px #ffd700;max-width:80vw">${song}</div>
      <div style="font-family:'Rajdhani',sans-serif;font-size:14px;color:#888">Tap to close</div>`;
    overlay.style.display = 'flex';
    setTimeout(() => overlay.remove(), 5000);
  }

  function hostAdvanceRound() {
    BingoEngine.advanceRound();
    renderHostControl();
  }

  function hostVerifyCard() {
    const input = document.getElementById('verify-card-input');
    const id = input ? input.value.trim() : '';
    alert(BingoEngine.verifyCard(id) ? `✅ Card ${id} is VALID` : `❌ Card ${id} not found.`);
  }

  function checkBingoWin() {
    if (!bingoPlayerCardId) return;
    const round = BingoEngine.getRound();
    if (BingoEngine.checkWin(bingoPlayerCardId, round)) {
      const content = document.getElementById('bingo-content');
      if (content) content.innerHTML = `
        <div style="text-align:center;padding:40px">
          <div style="font-family:'Orbitron',sans-serif;font-size:48px;font-weight:900;color:#ffd700;text-shadow:0 0 30px #ffd700">🎉 BINGO!</div>
          <div style="font-family:'Rajdhani',sans-serif;font-size:18px;color:#ff00aa;margin-top:12px">ROUND ${round} WINNER!</div>
          <div style="margin-top:24px"><button class="back-btn" onclick="HitgearOS.renderBingoMenu()">PLAY AGAIN</button></div>
        </div>`;
    } else {
      alert('Not a bingo yet — keep marking!');
    }
  }

  function viewBingoHistory() {
    const history = BingoEngine.getSongHistory();
    const content = document.getElementById('bingo-content');
    if (!content) return;
    content.innerHTML = `
      <div class="neon-panel" style="max-width:500px;margin:0 auto">
        <h3 style="color:#ff00aa;font-family:'Orbitron',sans-serif;margin-bottom:12px">CALL HISTORY (${history.length})</h3>
        <div style="max-height:300px;overflow-y:auto">
          ${history.length ? history.map((s,i) => `<div style="padding:6px 0;border-bottom:1px solid #ffffff11;font-family:'Rajdhani',sans-serif;color:#ccbbee">${i+1}. ${s}</div>`).join('') : '<div style="color:#666">No songs called yet.</div>'}
        </div>
        <button class="back-btn" style="margin-top:12px" onclick="HitgearOS.renderPlayerCard()">← BACK TO CARD</button>
      </div>`;
  }

  // ──── OPTIONS ────
  function openOptions() {
    showScreen('screen-options');
    renderOptions();
  }

  function renderOptions() {
    const save = SaveSystem.load() || SaveSystem.defaults();
    const settings = save.settings || {};
    const area = document.getElementById('options-area');
    if (!area) return;

    const toggle = (key, label, emoji) => `
      <div class="vip-stat-card" style="display:flex;align-items:center;justify-content:space-between;cursor:pointer" onclick="HitgearOS.toggleSetting('${key}')">
        <span style="font-family:'Orbitron',sans-serif;font-size:14px">${emoji} ${label}</span>
        <span id="opt-${key}" style="font-size:20px">${settings[key] ? '🟢' : '⚫'}</span>
      </div>`;

    area.innerHTML = `
      <div style="text-align:center;margin-bottom:16px">
        <img src="assets/ui/elements/options_settings/options_settings_010.png" style="height:clamp(48px,8vw,72px);width:auto;image-rendering:auto;filter:drop-shadow(0 0 12px #ff00aa88)" alt="">
        <img src="assets/ui/elements/options_settings/options_settings_013.png" style="height:clamp(48px,8vw,72px);width:auto;image-rendering:auto;filter:drop-shadow(0 0 12px #ff00aa88)" alt="">
        <img src="assets/ui/elements/options_settings/options_settings_015.png" style="height:clamp(48px,8vw,72px);width:auto;image-rendering:auto;filter:drop-shadow(0 0 12px #ff00aa88)" alt="">
      </div>
      <div class="vip-stats-grid" style="max-width:500px;margin:0 auto">
        ${toggle('sfx', 'SOUND EFFECTS', '🔊')}
        ${toggle('music', 'MUSIC', '🎵')}
        ${toggle('vibration', 'VIBRATION', '📳')}
      </div>
      <div style="margin-top:24px;text-align:center">
        ${settings.devMode ? `
          <div class="neon-panel neon-panel-gold" style="max-width:400px;margin:0 auto 16px">
            <div style="font-family:'Orbitron',sans-serif;font-size:12px;color:#ffd700;margin-bottom:12px">👑 OWNER / DEV MODE</div>
            <button class="back-btn" style="color:#ffd700;border-color:#ffd700;width:100%;margin-bottom:8px" onclick="HitgearOS.devForceUnlock()">🔓 UNLOCK ALL VENUES</button>
            <button class="back-btn" style="width:100%;margin-bottom:8px" onclick="HitgearOS.devAddPts()">💰 ADD 1000 STATUS PTS</button>
            <button class="back-btn" style="color:#ff4444;border-color:#ff4444;width:100%" onclick="HitgearOS.devResetSave()">⚠️ RESET ALL SAVE DATA</button>
          </div>` : ''}
        <div style="font-size:11px;color:#333;font-family:'Orbitron',sans-serif;cursor:pointer;margin-bottom:16px" onclick="HitgearOS.toggleDevMode()">
          ${settings.devMode ? '◉ OWNER MODE ON' : '○ owner mode'}
        </div>
        <button class="back-btn" onclick="HitgearOS.openGameMenu()">← BACK</button>
      </div>`;
  }

  function toggleSetting(key) {
    const save = SaveSystem.load() || SaveSystem.defaults();
    if (!save.settings) save.settings = {};
    save.settings[key] = !save.settings[key];
    SaveSystem.save(save);
    if (key === 'music') MusicEngine.setMuted(!save.settings.music);
    renderOptions();
  }

  function toggleDevMode() {
    const save = SaveSystem.load() || SaveSystem.defaults();
    if (!save.settings) save.settings = {};
    save.settings.devMode = !save.settings.devMode;
    SaveSystem.save(save);
    SceneManager.setDevMode(save.settings.devMode);
    renderOptions();
  }

  function devForceUnlock() {
    (window.VENUES || []).forEach(v => SaveSystem.unlockVenue(v.id));
    alert('All venues unlocked!');
    renderOptions();
  }

  function devAddPts() {
    SaveSystem.addPts(1000);
    alert('Added 1000 status points!');
    renderOptions();
  }

  function devResetSave() {
    if (confirm('Reset ALL save data? This cannot be undone.')) {
      SaveSystem.reset();
      alert('Save data reset.');
      boot();
    }
  }

  // ──── QUEST FLOW ────
  function newGame() {
    // No blocking prompt() on the handheld — use a default member name.
    // (A proper in-game name-entry screen can be added later.)
    SaveSystem.newGame('CREATOR');
    SaveSystem.patch({ characterId: 3, currentVenueId: 1 });
    openCharSelect(charId => {
      selectedCharId = charId;
      openVenueSelectForChar();
    });
  }

  function continueQuest() {
    const save = SaveSystem.load();
    if (!save) { newGame(); return; }
    selectedCharId = save.characterId || 1;
    selectedVenueId = save.currentVenueId || 1;
    launchGameplay(selectedCharId, selectedVenueId);
  }

  function startVenue(venueId) {
    selectedVenueId = venueId;
    SaveSystem.patch({ currentVenueId: venueId });
    openCharSelect(charId => { selectedCharId = charId; launchGameplay(charId, venueId); });
  }

  function openVenueSelectForChar() {
    openVenueMap();
  }

  function launchGameplay(charId, venueId) {
    const ch = window.CHARACTERS.find(c => c.id === charId);
    const venue = window.VENUES.find(v => v.id === venueId);
    if (!ch || !venue) { alert('Invalid character or venue.'); return; }

    const accentColor = venue.colors && (venue.colors.accent || venue.colors.neon);
    LoadingScreen.setProgress(0);
    LoadingScreen.show(accentColor, () => {
      _doLaunchGameplay(charId, venueId, ch, venue);
    }, 1500);

    // Kick off sprite frame preloading immediately; advance bar in sync.
    // preloadReady() resolves when enough frames are in cache to start smoothly.
    const ssReady = (typeof SpriteSystem !== 'undefined' && SpriteSystem.preloadReady)
      ? SpriteSystem.preloadReady(charId)
      : Promise.resolve();

    let p = 0;
    const ticker = setInterval(() => {
      p += 0.04 + Math.random() * 0.06;
      if (p >= 0.9) clearInterval(ticker); // hold near 90% until sprites ready
      LoadingScreen.setProgress(Math.min(p, 0.9));
    }, 60);

    ssReady.then(() => {
      clearInterval(ticker);
      LoadingScreen.setProgress(1);
    });
  }

  function _doLaunchGameplay(charId, venueId, ch, venue) {
    showScreen('screen-gameplay');
    const canvas = document.getElementById('gameCanvas');
    if (!canvas) return;

    // Hide any overlay
    const overlay = document.getElementById('game-overlay');
    if (overlay) overlay.style.display = 'none';
    const ps = document.getElementById('pause-screen');
    if (ps) ps.classList.remove('active');

    // Fit canvas to container
    const fitCanvas = () => {
      const wrap = canvas.parentElement;
      canvas.width  = wrap.clientWidth  || window.innerWidth;
      canvas.height = wrap.clientHeight || window.innerHeight - 44;
    };
    fitCanvas();
    window.addEventListener('resize', fitCanvas);

    QuestEngine.init(canvas);

    SaveSystem.patch({ characterId: charId, currentVenueId: venueId });
    QuestEngine.startQuest(charId, venueId);
    setupTouchControls();
  }

  function setupTouchControls() {
    const map = {
      'touch-up': 'up', 'touch-down': 'down',
      'touch-left': 'left', 'touch-right': 'right',
      'touch-a': 'attack', 'touch-b': 'special',
      'touch-x': 'dodge', 'touch-y': 'interact'
    };
    Object.entries(map).forEach(([btnId, action]) => {
      const btn = document.getElementById(btnId);
      if (!btn) return;
      btn.addEventListener('touchstart', e => { e.preventDefault(); InputManager.setTouch(action, true); }, { passive: false });
      btn.addEventListener('touchend',   e => { e.preventDefault(); InputManager.setTouch(action, false); }, { passive: false });
      btn.addEventListener('mousedown',  () => InputManager.setTouch(action, true));
      btn.addEventListener('mouseup',    () => InputManager.setTouch(action, false));
    });
  }

  function returnToMenu() {
    QuestEngine.stopQuest();
    // Brief neutral transition back to menu
    LoadingScreen.show(null, () => openGameMenu(), 500);
  }

  function retryVenue() {
    // Fade to loading screen before relaunching
    launchGameplay(selectedCharId, selectedVenueId);
  }

  // ──── PWA INSTALL PROMPT ────
  let deferredInstall = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredInstall = e;
    const btn = document.getElementById('pwa-install-btn');
    if (btn) btn.style.display = 'block';
  });

  function installPWA() {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    deferredInstall.userChoice.then(() => { deferredInstall = null; });
  }

  // ──── INIT ────
  function init() {
    // Load data
    window.CHARACTERS = window.CHARACTERS_DATA || window.CHARACTERS || [];
    window.VENUES     = window.VENUES_DATA     || window.VENUES     || [];
    boot();
  }

  return {
    init, boot, openOSMenu, openGameMenu, openCharSelect, openVenueMap,
    openVIPStatus, openBingo, openOptions, showScreen,
    newGame, continueQuest, startVenue, retryVenue, returnToMenu,
    renderBingoMenu, startBingoPlayer, startBingoHost, startBingoParty,
    renderPlayerCard, renderHostControl, hostCallNext, hostAdvanceRound,
    hostVerifyCard, checkBingoWin, viewBingoHistory,
    toggleSetting, toggleDevMode, devForceUnlock, devAddPts, devResetSave,
    installPWA
  };
})();

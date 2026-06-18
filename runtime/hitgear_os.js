'use strict';
const HitgearOS = (() => {
  let currentScreen = 'screen-boot';
  let selectedCharId = 1;
  let selectedVenueId = 1;
  let selectedOsIcon = 0;
  let clockInterval = null;

  // ──── SCREEN MANAGEMENT ────
  function showScreen(id, opts = {}) {
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

      const newMsgIdx = Math.floor((pct / 100) * messages.length);
      if (newMsgIdx !== msgIdx && newMsgIdx < messages.length) {
        msgIdx = newMsgIdx;
        if (loadText) loadText.textContent = messages[msgIdx];
      }
      if (pct >= 100) {
        clearInterval(tick);
        setTimeout(() => openOSMenu(), 600);
      }
    }, 40);

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
      { label: 'HITMANS VIP\nQUEST', emoji: '👑', action: () => openGameMenu() },
      { label: 'VENUES\n& SPOTS', emoji: '🗺️', action: () => openVenueMap() },
      { label: 'VIP\nSTATUS', emoji: '⭐', action: () => openVIPStatus() },
      { label: 'LIP SYNC\nBINGO', emoji: '🎤', action: () => openBingo() }
    ];
    grid.innerHTML = '';
    icons.forEach((ic, i) => {
      const div = document.createElement('div');
      div.className = 'os-icon' + (i === selectedOsIcon ? ' selected' : '');
      div.innerHTML = `<div class="os-icon-img">${ic.emoji}</div><div class="os-icon-label">${ic.label.replace('\n','<br>')}</div>`;
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
    const actions = [openGameMenu, openVenueMap, openVIPStatus, openBingo];
    if (e.key === 'ArrowRight' || e.key === 'd') { selectedOsIcon = Math.min(3, selectedOsIcon + 1); }
    if (e.key === 'ArrowLeft'  || e.key === 'a') { selectedOsIcon = Math.max(0, selectedOsIcon - 1); }
    if (e.key === 'ArrowDown'  || e.key === 's') { selectedOsIcon = Math.min(3, selectedOsIcon + 2); }
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
    { label: 'CONTINUE QUEST', action: () => continueQuest() },
    { label: 'NEW GAME',       action: () => newGame() },
    { label: 'VENUE MAP',      action: () => openVenueMap() },
    { label: 'VIP STATUS',     action: () => openVIPStatus() },
    { label: 'LIP SYNC BINGO', action: () => openBingo() },
    { label: 'OPTIONS',        action: () => openOptions() },
    { label: 'EXIT TO OS',     action: () => openOSMenu() }
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
      div.textContent = item.label;
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
          <div style="font-family:'Orbitron',sans-serif;font-size:clamp(22px,4vw,38px);font-weight:900;line-height:1">
            <span style="color:#e8d5ff">HITMANS</span>
            <span style="color:#ff00aa;text-shadow:0 0 12px #ff00aa"> VIP</span>
            <span style="display:block;font-size:0.45em;color:#ffd700;letter-spacing:6px;margin-top:4px">QUEST</span>
          </div>
          <div style="margin-top:16px;font-size:13px;color:#ccbbee;font-family:'Rajdhani',sans-serif;line-height:1.5">
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
    const save = SaveSystem.load() || SaveSystem.defaults();
    grid.innerHTML = '';
    window.CHARACTERS.forEach(ch => {
      const unlocked = save.statusPts >= (ch.unlockPts || 0);
      const card = document.createElement('div');
      card.className = 'char-card' + (ch.id === selectedCharId ? ' active' : '');
      card.innerHTML = `
        <div class="char-avatar">${ch.emoji}</div>
        <div class="char-name">${ch.name}</div>
        <div class="char-stat-bars">
          <div class="char-stat"><span class="char-stat-name">SPD</span><div class="char-stat-bar"><div class="char-stat-fill spd" style="width:${ch.spd}%"></div></div></div>
          <div class="char-stat"><span class="char-stat-name">STR</span><div class="char-stat-bar"><div class="char-stat-fill str" style="width:${ch.str}%"></div></div></div>
          <div class="char-stat"><span class="char-stat-name">DEF</span><div class="char-stat-bar"><div class="char-stat-fill def" style="width:${ch.def}%"></div></div></div>
        </div>
        ${!unlocked ? `<div class="char-locked">🔒<div style="font-size:9px;font-family:'Orbitron',sans-serif;margin-top:4px">${ch.unlockPts} PTS</div></div>` : ''}`;
      if (unlocked) {
        card.addEventListener('click', () => {
          selectedCharId = ch.id;
          renderCharSelect(onSelect);
          setTimeout(() => onSelect && onSelect(ch.id), 300);
        });
      }
      grid.appendChild(card);
    });
  }

  // ──── VENUE MAP ────
  function openVenueMap() {
    showScreen('screen-venue-map');
    renderVenueMap();
  }

  function renderVenueMap() {
    const grid = document.getElementById('venue-grid');
    if (!grid || !window.VENUES) return;
    const save = SaveSystem.load() || SaveSystem.defaults();
    grid.innerHTML = '';
    window.VENUES.forEach(v => {
      const unlocked = save.unlockedVenues.includes(v.id);
      const complete = save.completedMissions.includes(v.id);
      const card = document.createElement('div');
      card.className = 'venue-card ' + (unlocked ? 'unlocked' : 'locked');
      card.innerHTML = `
        <div class="venue-number">${String(v.id).padStart(2,'0')} / 16</div>
        <div class="venue-icon">${v.emoji}</div>
        <div class="venue-name">${v.shortName}</div>
        <div style="font-size:10px;color:#ff00aa;margin-top:4px;font-family:'Orbitron',sans-serif">${v.cameraType === 'topdown' ? '▣ TOP-DOWN' : '▶ SIDE-SCROLL'}</div>
        ${complete ? '<div style="font-size:10px;color:#ffd700;margin-top:2px">✓ COMPLETE</div>' : ''}
        <div class="venue-lock">${unlocked ? '' : '🔒'}</div>`;
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
    const name = prompt('Enter your member name (or leave blank):') || 'CREATOR';
    SaveSystem.newGame(name);
    SaveSystem.patch({ characterId: 1, currentVenueId: 1 });
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

    const ch = window.CHARACTERS.find(c => c.id === charId);
    const venue = window.VENUES.find(v => v.id === venueId);
    if (!ch || !venue) { alert('Invalid character or venue.'); return; }

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
    openGameMenu();
  }

  function retryVenue() {
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

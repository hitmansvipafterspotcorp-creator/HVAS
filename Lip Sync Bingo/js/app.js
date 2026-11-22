/*
 * app.js — Lip Sync Bingo UI + host/guest controllers.
 *
 * Architecture: HOST-AUTHORITATIVE. The host's phone runs the game
 * (Host object below): it deals every card from a seed, runs the caller,
 * validates every mark against the call history, verifies every BINGO
 * claim with LSB_CORE.verifyClaim, runs the stage + vote, and owns the
 * scoreboard. Guests are thin clients: they render what the host
 * broadcasts and send intents (mark / bingo / vote). A guest cannot
 * cheat by editing its own screen — the host re-checks everything.
 *
 * Solo mode is just a host with a loopback transport and no guests:
 * "just me" practice, no CPU players anywhere.
 */
(function () {
  'use strict';

  var Core = window.LSB_CORE;
  var Data = window.LSB_DATA;
  var Net = window.LSB_NET;

  /* ---------------- helpers ---------------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function show(screenId) {
    document.querySelectorAll('.screen').forEach(function (s) {
      s.classList.toggle('active', s.id === screenId);
    });
    // In a round, the game board owns the whole screen (Korey's design:
    // HOME pill + title over the panel, no brand header, no footer).
    document.body.classList.toggle('in-game', screenId === 'screen-game' || screenId === 'screen-stage');
    if (screenId !== 'screen-stage') stopStageMedia();
    window.scrollTo(0, 0);
  }
  var toastTimer = null;
  function toast(msg, ms) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, ms || 3200);
  }
  var bannerTimer = null;
  function banner(msg, ms) {
    var b = $('banner');
    b.textContent = msg;
    b.hidden = false;
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(function () { b.hidden = true; }, ms || 5000);
  }

  /* ---------------- sound (WebAudio synth — no files, no samples) ---------------- */
  var sfxOn = localStorage.getItem('lsb_sound') !== '0';
  var audioCtx = null;
  function tone(freq, t0, dur, type, gain) {
    if (!audioCtx) return;
    var o = audioCtx.createOscillator();
    var g = audioCtx.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    var t = audioCtx.currentTime + t0;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain || 0.12, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function sfx(name) {
    if (!sfxOn) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) { return; }
    if (!audioCtx) return;
    if (name === 'call') { tone(660, 0, 0.12, 'triangle', 0.10); tone(880, 0.09, 0.16, 'triangle', 0.10); }
    else if (name === 'mark') { tone(520, 0, 0.07, 'square', 0.05); tone(780, 0.05, 0.09, 'square', 0.05); }
    else if (name === 'deny') { tone(160, 0, 0.16, 'sawtooth', 0.06); }
    else if (name === 'stage') { tone(392, 0, 0.12, 'triangle', 0.11); tone(523, 0.1, 0.12, 'triangle', 0.11); tone(659, 0.2, 0.12, 'triangle', 0.11); tone(784, 0.3, 0.22, 'triangle', 0.12); }
    else if (name === 'vote') { tone(740, 0, 0.08, 'sine', 0.09); }
    else if (name === 'win') { [523, 659, 784, 1046].forEach(function (f, i) { tone(f, i * 0.11, 0.2, 'triangle', 0.12); }); tone(1318, 0.46, 0.34, 'triangle', 0.12); }
  }

  /* ---------------- screen FX: confetti + reaction floaters ---------------- */
  function confetti(n) {
    var layer = $('fx-layer');
    if (!layer) return;
    var colors = ['#ffd34d', '#ff4fd8', '#2dd4bf', '#a78bfa', '#ffffff'];
    for (var i = 0; i < (n || 60); i++) {
      var p = document.createElement('span');
      p.className = 'confetti-piece';
      p.style.left = (Math.random() * 100) + 'vw';
      p.style.background = colors[i % colors.length];
      p.style.animationDelay = (Math.random() * 0.35) + 's';
      p.style.animationDuration = (1.6 + Math.random() * 1.4) + 's';
      p.style.transform = 'rotate(' + (Math.random() * 360) + 'deg)';
      layer.appendChild(p);
      (function (el) { setTimeout(function () { el.remove(); }, 3600); })(p);
    }
  }
  function floater(emoji, name) {
    var layer = $('fx-layer');
    if (!layer) return;
    var f = document.createElement('span');
    f.className = 'floater';
    f.textContent = emoji;
    f.style.left = (8 + Math.random() * 78) + 'vw';
    f.title = name || '';
    layer.appendChild(f);
    setTimeout(function () { f.remove(); }, 2600);
  }

  /* ---------------- prefs + decks ---------------- */
  var myName = localStorage.getItem('lsb_name') || '';
  var selectedDeckId = localStorage.getItem('lsb_deck') || 'after-spot-starter';

  function customDecks() {
    var list;
    try { list = JSON.parse(localStorage.getItem('lsb_custom_decks') || '[]'); }
    catch (e) { return []; }
    if (!Array.isArray(list)) return [];
    // A saved custom deck can outlive the song pool (songs renamed or
    // dropped): an unknown id would deal as a broken square whose
    // track can never play — Korey's rule is a song with no track
    // never sits on a card. Filter them out, and drop decks that fall
    // below the 24 songs a card needs.
    return list.filter(function (d) {
      if (!d || !Array.isArray(d.songs)) return false;
      d.songs = d.songs.filter(function (sid) { return !!Data.SONG_MAP[sid]; });
      return d.songs.length >= 24;
    });
  }
  function saveCustomDecks(list) {
    localStorage.setItem('lsb_custom_decks', JSON.stringify(list));
  }
  function allDecks() { return Data.DECKS.concat(customDecks()); }
  function deckById(id) {
    var all = allDecks();
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return Data.DECKS[0];
  }

  /* ================= SAVED NIGHTS =================
     "Make a night stick": when a game reaches its final standings,
     the night is saved on THIS device (whoever is looking at the
     standings — host or guest): date/time, deck, room code, every
     player's final score, the winner. From there: a Past nights
     list, a one-tap rematch, and a shareable standings picture.
     All storage is fail-soft — a blocked or full localStorage must
     never break a game in progress. */
  var NIGHTS_KEY = 'lsb_nights';
  var NIGHTS_MAX = 30;
  // Storage id of the record saved for the game that just ended on
  // this screen. Re-renders of the same final standings UPDATE that
  // record (the host's state broadcast lands after the winner
  // message, with the final scores) instead of stacking duplicates.
  var nightSaveId = null;

  function loadNights() {
    try {
      var list = JSON.parse(localStorage.getItem(NIGHTS_KEY) || '[]');
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }
  function storeNights(list) {
    try { localStorage.setItem(NIGHTS_KEY, JSON.stringify(list)); return true; }
    catch (e) { return false; }
  }
  function paintPastNightsBtn() {
    var b = $('btn-past-nights');
    if (!b) return;
    var n = loadNights().length;
    b.textContent = '🌙 Past nights' + (n ? ' (' + n + ')' : '');
  }
  function nightById(id) {
    var list = loadNights();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function nightWhen(ts) {
    var d = new Date(ts || 0);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' • ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  /** The finished game on THIS screen, as a saved-night record —
      or null when this device has no finished game to record. */
  function currentNightRecord() {
    if (role === 'host' && H) {
      var w = null;
      if (H.winner) {
        var wp = playerById(H.winner.playerId);
        w = { name: H.winner.name, score: wp ? wp.score : null };
      }
      return Core.buildNightRecord({
        endedAt: Date.now(), roomCode: roomCode, deckId: H.deck.id, deckName: H.deck.name,
        mode: mode, players: publicPlayers(), winner: w, calledCount: H.called.length,
        patterns: H.patterns, patternsPicked: H.patternsPicked
      });
    }
    if (role === 'guest' && G && G.state) {
      var gw = null;
      if (G.winner) {
        gw = { name: G.winner.name, score: null };
        (G.state.players || []).forEach(function (p) {
          if (p.id === G.winner.playerId) gw.score = p.score;
        });
      }
      var deck = null;
      var wantName = G.state.deckName || G.deckName || '';
      allDecks().forEach(function (d) { if (d.name === wantName) deck = d; });
      return Core.buildNightRecord({
        endedAt: Date.now(), roomCode: roomCode, deckId: deck ? deck.id : null,
        deckName: wantName, mode: mode,
        players: G.state.players || [], winner: gw, calledCount: (G.state.called || []).length
      });
    }
    return null;
  }

  /** Save the finished game — once. Later re-renders of the same
      standings update the record named by nightSaveId (see above);
      a genuinely new finished game always gets a fresh record. (No
      signature dedupe: a rematch can legitimately end with identical
      standings, and a reloaded page holds no finished game in memory
      to re-save.) */
  function maybeSaveNight() {
    var rec = currentNightRecord();
    if (!rec || !rec.players.length) return;
    var list = loadNights();
    if (nightSaveId) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === nightSaveId) {
          rec.id = nightSaveId;
          rec.endedAt = list[i].endedAt; // keep the moment the game ended
          list[i] = rec;
          storeNights(list);
          return;
        }
      }
      nightSaveId = null; // the record was deleted from under this screen
    }
    rec.id = 'night-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36);
    list.unshift(rec);
    if (list.length > NIGHTS_MAX) list = list.slice(0, NIGHTS_MAX);
    if (storeNights(list)) { nightSaveId = rec.id; paintPastNightsBtn(); }
  }

  /* ---- one-tap rematch (in the room): same room code, same deck,
     same round/shape settings, scores reset, connected players stay
     in. That is exactly a fresh game in this room — hostNewGame does
     all of it without touching the transport. ---- */
  function hostRematch() {
    if (!H || H.phase !== 'over') return;
    hostNewGame();
    toast('🔁 Rematch! Same room, same deck — fresh cards, scores reset.');
  }

  /* ---- past nights UI ---- */
  var openNightId = null;
  function renderNights() {
    var wrap = $('nights-list');
    var list = loadNights();
    openNightId = null;
    $('night-detail').hidden = true;
    $('nights-list-wrap').hidden = false;
    wrap.innerHTML = '';
    if (!list.length) {
      wrap.innerHTML = '<p class="hint">No finished games saved yet — finish a game and its final standings land here automatically.</p>';
      return;
    }
    list.forEach(function (n) {
      var top = (n.players || [])[0];
      var row = document.createElement('button');
      row.className = 'night-row';
      row.innerHTML = '<span class="night-when">' + esc(nightWhen(n.endedAt)) + '</span>' +
        '<span class="night-deck">' + esc(n.deckName || 'Lip Sync Bingo') +
        (n.roomCode ? ' • Room ' + esc(n.roomCode) : '') + '</span>' +
        '<span class="night-top">' +
        (n.winner ? '🏆 ' + esc(n.winner.name) + ' took the night'
          : (top ? 'Top score: ' + esc(top.name) + ' — ' + top.score + ' pts' : '')) +
        ' • ' + (n.players || []).length + ((n.players || []).length === 1 ? ' player' : ' players') + '</span>';
      row.addEventListener('click', function () { openNight(n.id); });
      wrap.appendChild(row);
    });
  }
  function openNight(id) {
    var n = nightById(id);
    if (!n) { renderNights(); return; }
    openNightId = id;
    $('nights-list-wrap').hidden = true;
    $('night-detail').hidden = false;
    $('night-detail-title').textContent = n.deckName || 'Lip Sync Bingo';
    $('night-detail-meta').textContent = nightWhen(n.endedAt) +
      (n.roomCode ? ' • Room ' + n.roomCode : '') +
      (n.mode === 'solo' ? ' • Practice game' : n.mode === 'hotspot' ? ' • Hotspot game' : '');
    var ul = $('night-detail-list');
    ul.innerHTML = '';
    (n.players || []).forEach(function (p, i) {
      var li = document.createElement('li');
      if (n.winner && p.name === n.winner.name && p.score === n.winner.score) li.className = 'winner-row';
      li.innerHTML = '<span class="p-name">' + (i + 1) + '. ' + esc(p.name) + '</span>' +
        '<span class="p-meta"><span class="p-score">' + p.score + ' pts</span></span>';
      ul.appendChild(li);
    });
    if (!(n.players || []).length) ul.innerHTML = '<li>No players recorded.</li>';
  }
  function deleteOpenNight() {
    if (!openNightId) return;
    storeNights(loadNights().filter(function (n) { return n.id !== openNightId; }));
    if (nightSaveId === openNightId) nightSaveId = null;
    openNightId = null;
    paintPastNightsBtn();
    renderNights();
    toast('Night deleted.');
  }

  /* ---- rematch from a saved night: host the room again under the
     same code, same deck, same shapes. If the code is somehow taken
     (another live room owns it), say so plainly and run the rematch
     under a fresh code instead. ---- */
  function rematchNight() {
    var n = openNightId ? nightById(openNightId) : null;
    if (!n) return;
    if (!myName) { toast('Put your name in on the home screen first!'); show('screen-home'); return; }
    if (n.deckId) {
      var found = null;
      allDecks().forEach(function (x) { if (x.id === n.deckId) found = x; });
      if (found) {
        selectedDeckId = found.id;
        try { localStorage.setItem('lsb_deck', selectedDeckId); } catch (e) {}
        renderDeckGrid();
      }
    }
    function applySettings() {
      if (n.patterns) {
        H.patterns = { 1: n.patterns[1], 2: n.patterns[2], 3: n.patterns[3] };
        if (n.patternsPicked) {
          H.patternsPicked = { 1: !!n.patternsPicked[1], 2: !!n.patternsPicked[2], 3: !!n.patternsPicked[3] };
        }
        pickerSig.lobby = ''; pickerSig.scores = '';
      }
    }
    var hostCbs = { onMessage: hostOnMessage, onJoin: hostOnJoin, onLeave: hostOnLeave, onError: function () {}, onMedia: onNetMedia };
    if (n.mode === 'hotspot') {
      var ht = Net.createHotspotHost({ onMessage: hostOnMessage, onJoin: hostOnJoin, onLeave: hostOnLeave, onRemoteTrack: onHsTrack });
      enterHost('hotspot', ht, '');
      applySettings();
      toast('Hotspot rematch room open — pair each player below.');
      return;
    }
    if (n.mode === 'solo' || !n.roomCode) {
      enterHost('solo', Net.createLoopbackHost(), '');
      applySettings();
      toast('Practice rematch — same deck as that night.');
      return;
    }
    var wanted = n.roomCode;
    toast('Reopening room ' + wanted + '…');
    Net.createPeerHost(wanted, hostCbs)
      .then(function (t) {
        enterHost('online', t, wanted);
        applySettings();
        toast('🔁 Room ' + wanted + ' is back — same code, same deck. Your players can rejoin with the code!');
      })
      .catch(function (err) {
        if (!/already in use/i.test((err && err.message) || '')) { toast(err.message); return; }
        var fresh = Core.makeRoomCode();
        Net.createPeerHost(fresh, hostCbs)
          .then(function (t) {
            enterHost('online', t, fresh);
            applySettings();
            toast('Room ' + wanted + ' was taken — the rematch is room ' + fresh + ' instead. Share the new code!');
          })
          .catch(function (err2) { toast(err2.message); });
      });
  }

  /* ---- the shareable standings picture: native canvas only, no
     libraries, so it works on a hotspot with no internet. Portrait
     1080x1350 in the NOIR GOLD look. ---- */
  function drawStandingsImage(n) {
    var W = 1080, Hh = 1350;
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = Hh;
    var ctx = cv.getContext('2d');
    var GOLD = '#d4af37', GOLD_HI = '#f6e27a', GOLD_LO = '#a87f1f',
      TEXT = '#f5f2ea', MUTED = '#a09c90', FAINT = '#6e6a60',
      SURFACE = '#101013', LINE = '#26262c';
    var DISPLAY = '"Bricolage Grotesque","Manrope",sans-serif';
    var BODY = '"Manrope",sans-serif';
    ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, W, Hh);
    var glow = ctx.createRadialGradient(W / 2, -160, 60, W / 2, -160, 780);
    glow.addColorStop(0, 'rgba(212,175,55,0.20)');
    glow.addColorStop(1, 'rgba(212,175,55,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, 640);
    var grad = ctx.createLinearGradient(0, 0, 0, Hh);
    grad.addColorStop(0, GOLD_HI); grad.addColorStop(0.55, GOLD); grad.addColorStop(1, GOLD_LO);
    ctx.strokeStyle = grad; ctx.lineWidth = 6; ctx.strokeRect(26, 26, W - 52, Hh - 52);
    ctx.strokeStyle = 'rgba(212,175,55,0.40)'; ctx.lineWidth = 2; ctx.strokeRect(46, 46, W - 92, Hh - 92);
    function spaced(text, y, font, color, spacing) {
      ctx.font = font; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      try { ctx.letterSpacing = spacing || '0px'; } catch (e) {}
      ctx.fillText(text, W / 2, y);
      try { ctx.letterSpacing = '0px'; } catch (e) {}
    }
    function fit(text, maxWidth, font) {
      ctx.font = font;
      var t = String(text == null ? '' : text);
      if (ctx.measureText(t).width <= maxWidth) return t;
      while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
      return t + '…';
    }
    // Brand header — "LIP SYNC" in white, "BINGO" in gold, like the app.
    spaced('HITMANS VIP AFTER SPOT', 116, '800 29px ' + BODY, GOLD, '10px');
    var titleFont = '800 86px ' + DISPLAY;
    ctx.font = titleFont;
    var wA = ctx.measureText('LIP SYNC ').width, wB = ctx.measureText('BINGO').width;
    var tx = (W - (wA + wB)) / 2;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = TEXT; ctx.fillText('LIP SYNC ', tx, 182);
    ctx.fillStyle = GOLD; ctx.fillText('BINGO', tx + wA, 182);
    var rule = ctx.createLinearGradient(W / 2 - 190, 0, W / 2 + 190, 0);
    rule.addColorStop(0, GOLD_LO); rule.addColorStop(0.5, GOLD_HI); rule.addColorStop(1, GOLD_LO);
    ctx.fillStyle = rule; ctx.fillRect(W / 2 - 190, 234, 380, 4);
    spaced('FINAL STANDINGS', 282, '800 38px ' + DISPLAY, GOLD, '8px');
    var when = new Date(n.endedAt || 0);
    spaced(when.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) +
      ' • ' + when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      336, '600 29px ' + BODY, MUTED);
    spaced(fit('Deck: ' + (n.deckName || 'Lip Sync Bingo') + (n.roomCode ? '  •  Room ' + n.roomCode : ''), 900, '600 29px ' + BODY),
      378, '600 29px ' + BODY, MUTED);
    var y = 428;
    if (n.winner) {
      spaced('👑 WINNER', y + 8, '800 27px ' + BODY, GOLD, '6px');
      spaced(fit(n.winner.name, 880, '800 66px ' + DISPLAY), y + 62, '800 66px ' + DISPLAY, TEXT);
      if (typeof n.winner.score === 'number') {
        spaced(n.winner.score + ' PTS', y + 118, '800 33px ' + DISPLAY, GOLD, '3px');
      }
      y += 168;
    }
    // Ranked standings — as many rows as fit, then a "+N more" line.
    var players = n.players || [];
    var footTop = Hh - 148;
    var maxRows = Math.max(1, Math.floor((footTop - y) / 78));
    var shown = Math.min(players.length, maxRows);
    var rowH = Math.min(76, (footTop - y) / Math.max(1, shown));
    for (var i = 0; i < shown; i++) {
      var p = players[i];
      var ry = y + i * rowH;
      var isWin = !!(n.winner && p.name === n.winner.name && p.score === n.winner.score);
      ctx.fillStyle = SURFACE;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(90, ry, W - 180, rowH - 10, 14); else ctx.rect(90, ry, W - 180, rowH - 10);
      ctx.fill();
      if (isWin) { ctx.strokeStyle = grad; ctx.lineWidth = 2.5; ctx.stroke(); }
      ctx.textBaseline = 'middle';
      ctx.font = '800 32px ' + DISPLAY; ctx.fillStyle = GOLD; ctx.textAlign = 'left';
      ctx.fillText(String(i + 1), 122, ry + (rowH - 10) / 2);
      ctx.font = '700 34px ' + BODY; ctx.fillStyle = TEXT;
      ctx.fillText(fit(p.name, 560, '700 34px ' + BODY), 178, ry + (rowH - 10) / 2);
      ctx.font = '800 32px ' + DISPLAY; ctx.fillStyle = GOLD; ctx.textAlign = 'right';
      ctx.fillText(p.score + ' PTS', W - 122, ry + (rowH - 10) / 2);
    }
    if (players.length > shown) {
      spaced('+' + (players.length - shown) + ' more players', y + shown * rowH + 22, '600 26px ' + BODY, FAINT);
    }
    spaced('LIP SYNC BINGO • HITMANS VIP AFTER SPOT CORP', Hh - 96, '700 23px ' + BODY, MUTED, '3px');
    spaced('FREE PLAY — NO PRIZE MONEY', Hh - 62, '700 21px ' + BODY, FAINT, '3px');
    return cv;
  }
  function shareStandingsImage(n) {
    if (!n) return;
    var cv;
    try { cv = drawStandingsImage(n); } catch (e) { toast('Could not make the picture on this phone.'); return; }
    function download() {
      try {
        var a = document.createElement('a');
        a.download = 'lip-sync-bingo-standings.png';
        a.href = cv.toDataURL('image/png');
        document.body.appendChild(a);
        a.click();
        if (a.remove) a.remove();
        toast('Standings picture downloaded — post it anywhere!');
      } catch (e) { toast('Sharing is not available on this phone.'); }
    }
    if (cv.toBlob && typeof navigator !== 'undefined' && navigator.share && navigator.canShare) {
      cv.toBlob(function (blob) {
        if (!blob) { download(); return; }
        var file = null;
        try { file = new File([blob], 'lip-sync-bingo-standings.png', { type: 'image/png' }); } catch (e) { download(); return; }
        var data = { files: [file], title: 'Lip Sync Bingo — Final Standings' };
        var ok = false;
        try { ok = navigator.canShare(data); } catch (e) { ok = false; }
        if (ok) navigator.share(data).catch(function () { /* the host closed the share sheet — fine */ });
        else download();
      }, 'image/png');
    } else {
      download();
    }
  }

  function renderDeckGrid() {
    var grid = $('deck-grid');
    grid.innerHTML = '';
    allDecks().forEach(function (deck) {
      var b = document.createElement('button');
      b.className = 'deck-card' + (deck.id === selectedDeckId ? ' selected' : '');
      var covers = ['linear-gradient(135deg,#ff4fd8,#7b2ff7)','linear-gradient(135deg,#ffb300,#ff5e3a)','linear-gradient(135deg,#22d3ee,#2563eb)','linear-gradient(135deg,#34d399,#0e9f6e)','linear-gradient(135deg,#f472b6,#a21caf)','linear-gradient(135deg,#facc15,#ea580c)','linear-gradient(135deg,#818cf8,#4f46e5)','linear-gradient(135deg,#2dd4bf,#0d9488)','linear-gradient(135deg,#fb7185,#be123c)','linear-gradient(135deg,#a3e635,#15803d)'];
      var words = deck.name.split(' ').filter(function (w) { return /[A-Za-z0-9]/.test(w[0]); });
      var initials = words.length > 1 ? (words[0][0] + words[words.length - 1][0]).toUpperCase() : (words[0] ? words[0].slice(0, 2).toUpperCase() : '');
      var dh = 0; for (var ci = 0; ci < deck.id.length; ci++) dh += deck.id.charCodeAt(ci);
      var seenArt = {}, teaser = [];
      deck.songs.forEach(function (sid) {
        var sm = Data.SONG_MAP[sid];
        if (sm && !seenArt[sm.artist]) { seenArt[sm.artist] = 1; if (teaser.length < 3) teaser.push(sm.artist); }
      });
      b.innerHTML = '<span class="deck-cover" style="background:' + covers[dh % covers.length] + '"><span>' + initials + '</span></span><span class="deck-name">' + esc(deck.name) + '</span>' +
        '<span class="deck-tag">' + esc(deck.tagline || '') + '</span>' +
        (teaser.length ? '<span class="deck-teaser">' + esc(teaser.join(' • ')) + '…</span>' : '') +
        '<span class="deck-count">' + deck.songs.length + ' SONGS</span>';
      b.addEventListener('click', function () {
        selectedDeckId = deck.id;
        localStorage.setItem('lsb_deck', deck.id);
        renderDeckGrid();
      });
      grid.appendChild(b);
    });
  }

  /* ---------------- session ---------------- */
  var role = null;       // 'host' | 'guest'
  var mode = null;       // 'online' | 'hotspot' | 'solo'
  var transport = null;
  var roomCode = '';
  var H = null;          // host state
  var G = null;          // guest state
  var countdownInt = null;
  var stageInt = null;
  var autoResumeTimer = null;

  function requireName() {
    myName = $('player-name').value.trim();
    if (!myName) { toast('Put your name in first!'); $('player-name').focus(); return false; }
    localStorage.setItem('lsb_name', myName);
    return true;
  }

  /* ================= HOST ================= */

  function newHostState(deck) {
    return {
      deck: deck,
      roomSeed: 'room-' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36),
      players: {}, order: [], nextPid: 1,
      audience: {}, // peerKey -> {name} — vote + react, no card (Jackbox-style)
      phase: 'lobby', round: 1,
      // Win patterns per round: ladder defaults, host can pick any shape.
      patterns: { 1: Core.ROUND_PATTERNS[1], 2: Core.ROUND_PATTERNS[2], 3: Core.ROUND_PATTERNS[3] },
      patternsPicked: { 1: false, 2: false, 3: false },
      callSeq: [], callIdx: 0, called: [],
      auto: false, lastCallAt: 0,
      stage: null, votes: {}, stagedSongs: {},
      winner: null
    };
  }

  function hostAddPlayer(peerKey, name, isSelf) {
    var pid = 'p' + (H.nextPid++);
    var seed = Core.playerSeed(H.roomSeed, pid);
    var p = {
      id: pid, peerKey: peerKey, name: name || 'Player', seed: seed,
      card: Core.generateCard(H.deck.songs, seed),
      marks: new Set([Core.CENTER]), score: 0,
      connected: true, isSelf: !!isSelf
    };
    H.players[pid] = p;
    H.order.push(pid);
    return p;
  }
  function selfPlayer() {
    for (var i = 0; i < H.order.length; i++) {
      if (H.players[H.order[i]].isSelf) return H.players[H.order[i]];
    }
    return null;
  }
  function playerByPeer(peerKey) {
    for (var i = 0; i < H.order.length; i++) {
      var p = H.players[H.order[i]];
      if (p.peerKey === peerKey) return p;
    }
    return null;
  }
  function playerById(pid) { return H ? H.players[pid] : null; }

  function bestLine(marksSet) {
    var best = 0;
    Core.LINES.forEach(function (line) {
      var n = 0;
      line.forEach(function (i) { if (marksSet.has(i)) n++; });
      if (n > best) best = n;
    });
    return best;
  }
  function publicPlayers() {
    return H.order.map(function (pid) {
      var p = H.players[pid];
      return {
        id: p.id, name: p.name, marks: p.marks.size - 1,
        lines: Core.countLines(Array.from(p.marks)),
        best: bestLine(p.marks),
        score: p.score, connected: p.connected
      };
    });
  }
  function broadcast(obj) { if (transport) transport.broadcast(obj); }

  /* ---- win patterns: the active shape for the current round ---- */
  function activePatternId() {
    if (role === 'host' && H) return H.patterns[H.round] || Core.ROUND_PATTERNS[H.round];
    if (role === 'guest' && G && G.state && G.state.patternId) return G.state.patternId;
    return null;
  }
  function activePatternName() {
    var p = Core.patternById(activePatternId());
    return p ? p.name : null;
  }
  /** Points a win pays this round: picked shape = squares x 10;
      untouched ladder keeps the classic 50 / 100 / 150. */
  function activeRoundPoints() {
    if (role === 'host' && H && H.patternsPicked[H.round]) {
      return Core.patternPoints(H.patterns[H.round]);
    }
    return Core.roundWinPoints(H ? H.round : 1);
  }

  function hostBroadcastState() {
    broadcast({
      t: 'state', phase: H.phase, round: H.round,
      patternId: H.patterns[H.round], patternName: (Core.patternById(H.patterns[H.round]) || {}).name || '',
      called: H.called.slice(),
      current: H.called.length ? H.called[H.called.length - 1] : null,
      deckName: H.deck.name, players: publicPlayers(),
      audience: Object.keys(H.audience).length,
      winner: H.winner
    });
    renderProgress(publicPlayers());
    if ($('screen-lobby').classList.contains('active')) renderLobbyPlayers(publicPlayers());
    if ($('screen-scores').classList.contains('active')) renderScores();
  }

  function sendWelcome(p) {
    transport.sendTo(p.peerKey, {
      t: 'welcome', playerId: p.id, name: p.name,
      deckId: H.deck.id, deckName: H.deck.name,
      card: { cells: p.card.cells, mic: p.card.mic },
      round: H.round, phase: H.phase
    });
  }

  function hostOnJoin(peerKey) { /* player is created on 'hello' */ }
  function hostOnLeave(peerKey) {
    if (!H) return; // our own leaveRoom: late close events land after H is gone — playerByPeer would throw on the null host
    if (H.audience[peerKey]) {
      delete H.audience[peerKey];
      hostBroadcastState();
    }
    var p = playerByPeer(peerKey);
    if (p) {
      p.connected = false;
      toast(p.name + ' left the room.');
      hostBroadcastState();
      if ($('screen-lobby').classList.contains('active')) renderLobby();
    }
  }

  /* Resync a (re)joining guest: welcome + current screen + their marks,
     so a refreshed phone lands exactly where the game is. */
  function resyncGuest(p) {
    sendWelcome(p);
    if (H.phase === 'lobby') return;
    if (H.phase === 'roundEnd' || H.phase === 'over') {
      // The round is over: land the rejoining guest on the scores
      // screen like everyone else. The old code sent 'game' here,
      // dropping them onto a live board while the room saw results.
      transport.sendTo(p.peerKey, { t: 'marks', playerId: p.id, marks: Array.from(p.marks) });
      if (H.winner) {
        transport.sendTo(p.peerKey, { t: 'winner', playerId: H.winner.playerId, name: H.winner.name, round: H.winner.round, points: H.winner.points, patternName: activePatternName() || '' });
      } else {
        transport.sendTo(p.peerKey, { t: 'round-end', round: H.round });
      }
      return;
    }
    transport.sendTo(p.peerKey, { t: 'game', round: H.round });
    transport.sendTo(p.peerKey, { t: 'marks', playerId: p.id, marks: Array.from(p.marks) });
    if ((H.phase === 'stage' || H.phase === 'vote') && H.stage) {
      var st = H.stage;
      if (st.sub === 'claim') {
        transport.sendTo(p.peerKey, { t: 'claim-stage', songId: st.songId, holders: stageList(st.holders), seconds: CLAIM_SECONDS });
        transport.sendTo(p.peerKey, { t: 'claim-update', claims: st.claims.slice(), passed: st.passed.slice(), status: claimStatusText() });
      } else {
        transport.sendTo(p.peerKey, {
          t: 'stage', songId: st.songId, mode: st.mode, performers: st.list,
          performerId: st.performerId, performerName: st.list.length ? st.list[0].name : '',
          seconds: STAGE_SECONDS, media: mediaRoster()
        });
        if (H.phase === 'vote') {
          transport.sendTo(p.peerKey, {
            t: 'vote-open', mode: st.mode, performers: st.list,
            performerId: st.performerId, performerName: st.list.length ? st.list[0].name : '',
            songId: st.songId, seconds: 20, eligible: voteEligibleCount()
          });
        }
      }
    }
  }

  function hostOnMessage(peerKey, msg) {
    if (!H || !msg || !msg.t) return;
    if (msg.t === 'hello') {
      var nm = String(msg.name || 'Player').slice(0, 20);
      if (msg.audience) {
        var akey = null;
        Object.keys(H.audience).forEach(function (k) {
          if (H.audience[k].name.toLowerCase() === nm.toLowerCase()) akey = k;
        });
        if (akey && akey !== peerKey) { H.audience[peerKey] = H.audience[akey]; delete H.audience[akey]; }
        else if (!H.audience[peerKey]) H.audience[peerKey] = { name: nm };
        transport.sendTo(peerKey, { t: 'welcome-aud', name: nm, deckName: H.deck.name, round: H.round, phase: H.phase });
        if (H.phase !== 'lobby') transport.sendTo(peerKey, { t: 'game', round: H.round });
        hostBroadcastState();
        toast(nm + ' joined the audience!');
        return;
      }
      var existing = playerByPeer(peerKey);
      if (existing) { resyncGuest(existing); hostBroadcastState(); return; }
      // Rejoin: a disconnected seat with the same name gets its card,
      // marks and score back — a locked phone never kills a player's game.
      var rejoin = null;
      for (var ri = 0; ri < H.order.length; ri++) {
        var rp = H.players[H.order[ri]];
        if (!rp.connected && !rp.isSelf && rp.name.toLowerCase() === nm.toLowerCase()) { rejoin = rp; break; }
      }
      if (rejoin) {
        rejoin.peerKey = peerKey;
        rejoin.connected = true;
        resyncGuest(rejoin);
        hostBroadcastState();
        renderLobby();
        toast(rejoin.name + ' is back in the game!');
        return;
      }
      var p = hostAddPlayer(peerKey, msg.name, false);
      sendWelcome(p);
      if (H.phase !== 'lobby') transport.sendTo(peerKey, { t: 'game', round: H.round });
      hostBroadcastState();
      renderLobby();
      toast(p.name + ' joined the room!');
      return;
    }
    if (msg.t === 'react') { hostRelayReact(peerKey, msg.emoji); return; }
    var player = playerByPeer(peerKey);
    if (!player) {
      if (msg.t === 'vote' && H.audience[peerKey]) hostHandleVoteAud(peerKey, msg.vote);
      return;
    }
    if (msg.t === 'mark') hostHandleMark(player, msg.songId);
    else if (msg.t === 'bingo') hostHandleClaim(player);
    else if (msg.t === 'vote') hostHandleVote(player, msg.vote);
    else if (msg.t === 'claim') hostHandleClaimMic(player);
    else if (msg.t === 'pass') hostHandlePassMic(player);
    else if (msg.t === 'decline') hostHandleDecline(player);
  }

  /* ---- live reactions: relayed by the host to every screen ---- */
  var REACTS = ['🔥', '😂', '👏', '🎤'];
  function hostRelayReact(peerKey, emoji) {
    if (REACTS.indexOf(emoji) === -1) return;
    var who = '';
    var p = playerByPeer(peerKey);
    if (p) who = p.name;
    else if (H.audience[peerKey]) who = H.audience[peerKey].name;
    broadcast({ t: 'react', emoji: emoji, name: who });
    floater(emoji, who);
  }

  /* ---- marks: validated against the call history, always ---- */
  function hostHandleMark(p, songId) {
    if (!H || ['playing', 'stage', 'vote'].indexOf(H.phase) === -1) return;
    var v = Core.validateMark(p.card, H.called, songId);
    if (!v.ok) {
      if (!p.isSelf) transport.sendTo(p.peerKey, { t: 'mark-denied', songId: songId, reason: v.reason });
      return;
    }
    // A MIC square can never be plain-marked: it is earned on stage,
    // by performing — or not at all (Korey's rule).
    var midx = p.card.cells.indexOf(songId);
    if (midx !== -1 && p.card.mic.indexOf(midx) !== -1) {
      if (!p.isSelf) transport.sendTo(p.peerKey, { t: 'mark-denied', songId: songId, reason: 'mic-stage' });
      else toast('🎤 That\u2019s a mic square — claim it on stage and perform to earn it.');
      return;
    }
    var idx = p.card.cells.indexOf(songId);
    if (idx === -1 || p.marks.has(idx)) return;
    p.marks.add(idx);
    broadcast({ t: 'marks', playerId: p.id, marks: Array.from(p.marks) });
    hostBroadcastState();
    if (p.isSelf) { sfx('mark'); renderGame(); }
  }

  /* ---- BINGO claims: verified by the host before any winner ---- */
  function hostHandleClaim(p) {
    if (!H || H.phase !== 'playing') return;
    var res = Core.verifyClaim({
      deckSongIds: H.deck.songs, seed: p.seed, cells: p.card.cells,
      marks: Array.from(p.marks), calledSongIds: H.called, round: H.round,
      patternId: H.patterns[H.round]
    });
    if (!res.ok) {
      if (p.isSelf) {
        sfx('deny');
        $('bingo-status').textContent = 'Not yet — the card check says: ' + res.reason.replace(/-/g, ' ') + '.';
      } else {
        transport.sendTo(p.peerKey, { t: 'claim-denied', reason: res.reason });
      }
      broadcast({ t: 'claim-rejected', playerId: p.id, name: p.name });
      return;
    }
    var pts = activeRoundPoints();
    p.score += pts;
    H.winner = { playerId: p.id, name: p.name, round: H.round, points: pts };
    H.phase = (H.round >= 3) ? 'over' : 'roundEnd';
    sfx('win'); confetti(70);
    broadcast({ t: 'winner', playerId: p.id, name: p.name, round: H.round, points: pts, patternName: activePatternName() || '' });
    hostBroadcastState();
    showScores();
    banner('🎉 ' + p.name + ' — BINGO! Round ' + H.round + ' (+' + pts + ' pts)');
  }

  /* ---- the caller ---- */
  function hostStartGame() {
    nightSaveId = null; // a new game gets its own saved-night record
    H.phase = 'playing';
    H.round = 1;
    H.winner = null;
    H.callSeq = Core.callOrder(H.deck.songs, H.roomSeed);
    H.callIdx = 0;
    H.called = [];
    H.lastCallAt = 0;
    broadcast({ t: 'game', round: 1, deckName: H.deck.name, patternId: H.patterns[1], patternName: activePatternName() || '' });
    hostBroadcastState();
    show('screen-game');
    renderGame();
    // Bulletproof the music: probe every song in the call queue in
    // the background, starting now (see the track health check).
    startTrackHealth();
    toast('Round 1 — ' + (activePatternName() || 'Line') + ' to win. Call the first song!');
  }

  var callGatePending = false;
  function hostCallNext() {
    if (!H || H.phase !== 'playing' || callGatePending) return;
    // Dead-song law at the gate: a song the health check already
    // buried is never called — step over it.
    while (H.callIdx < H.callSeq.length) {
      var headHealth = trackHealth[H.callSeq[H.callIdx]];
      if (headHealth && headHealth.state === 'dead') { H.callIdx++; continue; }
      break;
    }
    if (H.callIdx >= H.callSeq.length) { toast('Every song in the deck has been called.'); return; }
    var songId = H.callSeq[H.callIdx];
    var hh = trackHealth[songId];
    if (mode !== 'hotspot' && (!hh || hh.state === 'checking')) {
      // Pre-call guarantee: this song's track check is still running.
      // Finish it first (the check jumps the queue) and call only once
      // a working source is verified — a few seconds of patience beats
      // a dead call in front of the room. Then re-enter: the gate
      // either calls it or steps over it, now knowing.
      callGatePending = true;
      var gateHost = H;
      toast('Checking the next song\u2019s track…');
      checkSong(songId).then(function () {
        callGatePending = false;
        if (H && H === gateHost && H.phase === 'playing') hostCallNext();
      });
      return;
    }
    H.callIdx++;
    H.called.push(songId);
    H.lastCallAt = Date.now();
    sfx('call');
    // Guests get the verified source with the call, so their Play tap
    // starts from the source that already answered the host's probe.
    broadcast({ t: 'call', songId: songId, n: H.called.length, total: H.callSeq.length, at: H.lastCallAt, src: (hh && hh.state === 'ok') ? hh.prefLeg : null });
    hostBroadcastState();
    renderGame();
    startCountdown(H.lastCallAt);
    maybeStage(songId);
    // The called song plays out loud on the caller's phone (the Call tap
    // is the gesture browsers require for sound). Hotspot rooms have no
    // internet — the host plays it in the room instead.
    if (mode !== 'hotspot') playTrack(songId, 'call');
  }

  function hostEndRound() {
    if (!H || H.phase !== 'playing') return;
    H.winner = null;
    H.phase = (H.round >= 3) ? 'over' : 'roundEnd';
    broadcast({ t: 'round-end', round: H.round });
    hostBroadcastState();
    showScores();
  }

  function hostNextRound() {
    if (!H || H.round >= 3) return;
    H.round++;
    H.winner = null;
    H.phase = 'playing';
    broadcast({ t: 'round', round: H.round, patternId: H.patterns[H.round], patternName: activePatternName() || '' });
    hostBroadcastState();
    show('screen-game');
    renderGame();
    toast('Round ' + H.round + ' — ' + (activePatternName() || 'Line') + ' to win!');
  }

  function hostNewGame() {
    // Kill anything the old game left running: a stage/vote countdown
    // or the post-vote auto-resume must never fire into the new game.
    clearInterval(stageInt);
    clearInterval(countdownInt);
    clearTimeout(autoResumeTimer);
    H.stage = null;
    H.roomSeed = 'room-' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
    H.stagedSongs = {};
    H.order.forEach(function (pid) {
      var p = H.players[pid];
      p.seed = Core.playerSeed(H.roomSeed, pid);
      p.card = Core.generateCard(H.deck.songs, p.seed);
      p.marks = new Set([Core.CENTER]);
      p.score = 0;
      if (!p.isSelf) {
        transport.sendTo(p.peerKey, { t: 'card', card: { cells: p.card.cells, mic: p.card.mic } });
      }
    });
    hostStartGame();
  }

  /* ---- stage: claim it, perform it LIVE on every screen, or lose
     the square. Two claims on the same mic song = a TikTok-style
     BATTLE, and only the winner takes the square. (Korey's rules.) -- */
  var STAGE_SECONDS = 60;   // the track plays for one full minute
  var CALL_SECONDS = 60;    // a called song plays for one full minute (Korey 2026-11-21: one minute, not 30s)
  var CLAIM_SECONDS = 10;

  function stageCardsById() {
    var m = {};
    H.order.forEach(function (pid) { m[pid] = H.players[pid].card; });
    return m;
  }
  function stageList(ids) {
    return (ids || []).map(function (pid) {
      var p = playerById(pid);
      return { id: pid, name: p ? p.name : 'Player' };
    });
  }

  function maybeStage(songId) {
    if (H.stagedSongs[songId]) return;
    var holders = Core.findPerformers(stageCardsById(), H.order, songId);
    if (!holders.length) return;
    var seedAtCall = H.roomSeed;
    setTimeout(function () {
      // The roomSeed check ties this timer to the game it was scheduled
      // in: without it, a claim stage from the PREVIOUS game could pop
      // open 2.5s into a brand-new one.
      if (H && H.roomSeed === seedAtCall && H.phase === 'playing' && !H.stagedSongs[songId]) openClaimStage(songId, holders);
    }, 2500);
  }

  function openClaimStage(songId, holderIds) {
    H.stagedSongs[songId] = 'claim';
    H.phase = 'stage';
    H.stage = {
      songId: songId, holders: holderIds.slice(), claims: [], passed: [],
      performers: [], performerId: null, list: [], mode: 'pending', sub: 'claim'
    };
    broadcast({ t: 'claim-stage', songId: songId, holders: stageList(holderIds), seconds: CLAIM_SECONDS });
    hostBroadcastState();
    showClaimStage(songId, stageList(holderIds));
    startStageCountdown(CLAIM_SECONDS, function () { if (H && H.phase === 'stage') resolveClaims(); });
  }

  function claimStatusText() {
    var st = H.stage;
    var claimed = st.claims.map(function (pid) { return playerName(pid); });
    var waiting = st.holders.filter(function (pid) {
      return st.claims.indexOf(pid) === -1 && st.passed.indexOf(pid) === -1;
    }).map(function (pid) { return playerName(pid); });
    var parts = [];
    if (claimed.length) parts.push('🎤 In: ' + claimed.join(' vs '));
    if (waiting.length) parts.push('Waiting on: ' + waiting.join(', '));
    if (!claimed.length && !waiting.length) parts.push('Nobody claimed it.');
    return parts.join(' • ');
  }

  function broadcastClaimUpdate() {
    broadcast({ t: 'claim-update', claims: H.stage.claims.slice(), passed: H.stage.passed.slice(), status: claimStatusText() });
    $('claim-status').textContent = claimStatusText();
    paintClaimButtons();
  }

  function hostHandleClaimMic(p) {
    if (!H || H.phase !== 'stage' || !H.stage || H.stage.sub !== 'claim') return;
    if (H.stage.holders.indexOf(p.id) === -1) return;
    if (H.stage.claims.indexOf(p.id) !== -1 || H.stage.passed.indexOf(p.id) !== -1) return;
    if (H.stage.claims.length >= 2) {
      if (!p.isSelf) transport.sendTo(p.peerKey, { t: 'claim-full' });
      else toast('Two players already claimed it — the battle is set.');
      return;
    }
    H.stage.claims.push(p.id);
    broadcastClaimUpdate();
    maybeResolveClaims();
  }

  function hostHandlePassMic(p) {
    if (!H || H.phase !== 'stage' || !H.stage || H.stage.sub !== 'claim') return;
    if (H.stage.holders.indexOf(p.id) === -1) return;
    if (H.stage.claims.indexOf(p.id) !== -1 || H.stage.passed.indexOf(p.id) !== -1) return;
    H.stage.passed.push(p.id);
    broadcastClaimUpdate();
    maybeResolveClaims();
  }

  function maybeResolveClaims() {
    var st = H.stage;
    if (st.claims.length >= 2) resolveClaims();
    else if (st.claims.length + st.passed.length >= st.holders.length) resolveClaims();
  }

  function resolveClaims() {
    if (!H || H.phase !== 'stage' || !H.stage || H.stage.sub !== 'claim') return;
    clearInterval(stageInt);
    var performers = H.stage.claims.slice(0, 2);
    if (!performers.length) {
      // Nobody stepped up — no square for anyone, back to the game.
      H.phase = 'playing';
      H.stage = null;
      broadcast({ t: 'stage-end' });
      hostBroadcastState();
      show('screen-game');
      renderGame();
      toast('Nobody claimed the mic — no square this time.');
      return;
    }
    startPerformance(performers);
  }

  /** PeerJS media roster: my broker id + every connected player's and
      audience member's broker id, so a performer can call them all. */
  function mediaRoster() {
    if (mode !== 'online' || !transport || !transport.myMediaId) return null;
    var ids = [transport.myMediaId()];
    H.order.forEach(function (pid) {
      var p = H.players[pid];
      if (!p.isSelf && p.connected) ids.push(p.peerKey);
    });
    Object.keys(H.audience).forEach(function (k) { ids.push(k); });
    return ids;
  }

  function startPerformance(performerIds) {
    var st = H.stage;
    st.performers = performerIds.slice();
    st.performerId = performerIds[0];
    st.list = stageList(performerIds);
    st.mode = performerIds.length > 1 ? 'battle' : 'solo';
    st.sub = 'perform';
    H.stagedSongs[st.songId] = performerIds.slice();
    broadcast({
      t: 'stage', songId: st.songId, mode: st.mode, performers: st.list,
      performerId: st.performerId, performerName: st.list[0].name,
      seconds: STAGE_SECONDS, media: mediaRoster()
    });
    hostBroadcastState();
    showStage(st.songId, st.list, st.mode);
    startStageCountdown(STAGE_SECONDS, function () { if (H && H.phase === 'stage') endPerformance(); }, { gateOnSong: true });
  }

  /* Everyone except the performer(s) votes: players AND audience. */
  function voteEligibleCount() {
    if (!H || !H.stage) return 0;
    var perfs = H.stage.performers || [];
    var n = H.order.filter(function (pid) { return perfs.indexOf(pid) === -1; }).length;
    return n + Object.keys(H.audience).length;
  }

  function endPerformance() {
    if (!H || H.phase !== 'stage') return;
    clearInterval(stageInt);
    stopTrack();
    var st = H.stage;
    H.phase = 'vote';
    st.sub = 'vote';
    H.votes = {};
    var eligibleCount = voteEligibleCount();
    broadcast({
      t: 'vote-open', mode: st.mode, performers: st.list,
      performerId: st.performerId, performerName: st.list.length ? st.list[0].name : '',
      songId: st.songId, seconds: 20, eligible: eligibleCount
    });
    showVoteUI(st.list, st.mode);
    if (eligibleCount === 0) { closeVote(); return; } // solo room: nobody to vote
    startStageCountdown(20, function () { if (H && H.phase === 'vote') closeVote(); });
  }

  /** Live battle split (votes per battler) so every screen can paint the
      tug-of-war bar while voting is still open. */
  function battleSplit() {
    if (!H || !H.stage || H.stage.mode !== 'battle') return null;
    var a = 0, b = 0;
    Object.keys(H.votes).forEach(function (k) {
      if (H.votes[k] === H.stage.performers[0]) a++;
      else if (H.votes[k] === H.stage.performers[1]) b++;
    });
    return { a: a, b: b };
  }
  function sendVoteCount() {
    var eligible = voteEligibleCount();
    var sp = battleSplit();
    var msg = { t: 'vote-count', count: Object.keys(H.votes).length, total: eligible };
    if (sp) { msg.a = sp.a; msg.b = sp.b; }
    broadcast(msg);
    updateVoteStatus(msg.count, eligible, sp);
    return eligible;
  }

  function hostHandleVote(p, vote) {
    if (!H || H.phase !== 'vote' || !H.stage) return;
    if (H.stage.mode === 'battle') {
      if (H.stage.performers.indexOf(p.id) !== -1) return; // battlers don't vote
      if (H.stage.performers.indexOf(vote) === -1) return; // pick must be a battler
    } else {
      if (p.id === H.stage.performerId) return;
      if (!Object.prototype.hasOwnProperty.call(Core.VOTE_POINTS, vote)) return;
    }
    if (H.votes[p.id]) return; // one vote each
    H.votes[p.id] = vote;
    var eligible = sendVoteCount();
    if (Object.keys(H.votes).length >= eligible) closeVote();
  }

  function hostHandleVoteAud(peerKey, vote) {
    if (!H || H.phase !== 'vote' || !H.stage) return;
    if (H.stage.mode === 'battle') {
      if (H.stage.performers.indexOf(vote) === -1) return;
    } else if (!Object.prototype.hasOwnProperty.call(Core.VOTE_POINTS, vote)) return;
    var key = 'aud:' + peerKey;
    if (H.votes[key]) return; // one vote each
    H.votes[key] = vote;
    var eligible = sendVoteCount();
    if (Object.keys(H.votes).length >= eligible) closeVote();
  }

  /** The square itself: marked by the host ONLY after a performance —
      never by a plain tap on a mic cell. */
  function awardSquare(p, songId) {
    if (!p) return false;
    var idx = p.card.cells.indexOf(songId);
    if (idx === -1 || p.marks.has(idx)) return false;
    p.marks.add(idx);
    broadcast({ t: 'marks', playerId: p.id, marks: Array.from(p.marks) });
    return true;
  }

  function closeVote() {
    if (!H || H.phase !== 'vote') return;
    clearInterval(stageInt);
    var st = H.stage;
    var voteVals = Object.keys(H.votes).map(function (k) { return H.votes[k]; });
    H.phase = 'playing';
    st.sub = 'result';
    if (st.mode === 'battle') {
      var tally = Core.tallyBattle(voteVals, st.performers[0], st.performers[1]);
      var winner = tally.winner ? playerById(tally.winner) : null;
      if (winner) awardSquare(winner, st.songId); // winner takes the square — loser doesn't get it
      var results = st.list.map(function (pf) {
        var pl = playerById(pf.id);
        var pts = tally.points[pf.id] || 0;
        if (pl) pl.score += pts;
        return {
          id: pf.id, name: pf.name,
          votes: pf.id === st.performers[0] ? tally.votesA : tally.votesB,
          points: pts, total: pl ? pl.score : 0
        };
      });
      broadcast({ t: 'vote-result', mode: 'battle', results: results, winnerId: tally.winner, songId: st.songId });
      hostBroadcastState();
      showBattleResult(results, tally.winner);
    } else {
      var performer = playerById(st.performerId);
      var tally2 = Core.tallyVotes(voteVals);
      if (performer) performer.score += tally2.points;
      awardSquare(performer, st.songId); // performed = square earned
      broadcast({
        t: 'vote-result', performerId: st.performerId,
        performerName: performer ? performer.name : '',
        points: tally2.points, breakdown: tally2.breakdown,
        total: performer ? performer.score : 0, square: true
      });
      hostBroadcastState();
      showVoteResult(st.performerId, tally2, performer ? performer.score : 0, true);
    }
    clearTimeout(autoResumeTimer);
    autoResumeTimer = setTimeout(function () { resumeGame(); }, 15000);
  }

  /* Declining mid-performance costs the square: solo ends the stage;
     in a battle the other performer takes the square by walkover. */
  function hostHandleDecline(p) {
    if (!H || H.phase !== 'stage' || !H.stage || H.stage.sub !== 'perform') return;
    if (H.stage.performers.indexOf(p.id) === -1) return;
    clearInterval(stageInt);
    stopTrack();
    var st = H.stage;
    if (st.mode === 'battle') {
      var otherId = st.performers[0] === p.id ? st.performers[1] : st.performers[0];
      var other = playerById(otherId);
      awardSquare(other, st.songId);
      H.phase = 'playing';
      st.sub = 'result';
      broadcast({ t: 'battle-forfeit', winnerId: otherId, winnerName: other ? other.name : '', loserName: p.name, songId: st.songId });
      hostBroadcastState();
      showBattleForfeit(other ? other.name : 'The other performer', p.name);
      clearTimeout(autoResumeTimer);
      autoResumeTimer = setTimeout(function () { resumeGame(); }, 15000);
    } else {
      H.phase = 'playing';
      H.stage = null;
      broadcast({ t: 'stage-declined', name: p.name });
      hostBroadcastState();
      show('screen-game');
      renderGame();
      toast(p.name + ' passed on performing — no square.');
    }
  }

  function resumeGame() {
    clearTimeout(autoResumeTimer);
    if (!H) return;
    if (H.phase === 'playing' && H.stage && H.stage.sub === 'result') {
      H.stage = null;
      broadcast({ t: 'resume' });
      show('screen-game');
      renderGame();
    }
  }

  /* ================= GUEST ================= */

  function guestDisconnected() {
    toast('The host closed the room.');
    leaveRoom(true);
  }

  function guestOnMessage(msg) {
    if (!G || !msg || !msg.t) return;
    switch (msg.t) {
      case 'welcome':
        G.id = msg.playerId;
        G.card = msg.card;
        G.marks = new Set([Core.CENTER]);
        G.deckName = msg.deckName;
        renderLobby();
        break;
      case 'welcome-aud':
        G.audience = true;
        G.deckName = msg.deckName;
        renderLobby();
        toast('You are in the audience — watch the stage and vote!');
        break;
      case 'react':
        if (msg.name !== myName) floater(msg.emoji, msg.name);
        break;
      case 'state':
        G.state = msg;
        renderProgress(msg.players);
        if ($('screen-lobby').classList.contains('active')) renderLobbyPlayers(msg.players);
        if ($('screen-game').classList.contains('active')) renderGame();
        if ($('screen-scores').classList.contains('active')) renderScores();
        break;
      case 'game':
        ensureTrackPlayer(); // guests get no Start tap — build the player on game entry so it is ready before their first Play tap
        nightSaveId = null; // a new game gets its own saved-night record
        G.winner = null;
        G.roundEnded = null;
        show('screen-game');
        renderGame();
        toast('Game on! Round ' + msg.round + (msg.patternName ? ' — ' + msg.patternName + ' to win!' : ' — good luck!'));
        break;
      case 'card':
        G.card = msg.card;
        G.marks = new Set([Core.CENTER]);
        if ($('screen-game').classList.contains('active')) renderGame();
        break;
      case 'call':
        sfx('call');
        if (G.state) { G.state.called = (G.state.called || []).concat([msg.songId]); }
        updateCallerBar(msg.songId, msg.n, msg.total, G.state ? G.state.round : 1);
        startCountdown(msg.at);
        if ($('screen-game').classList.contains('active')) renderGame();
        // Surface the called song with a Play button — a phone can only
        // start sound from its own tap, so we don't fake autoplay here.
        if (mode !== 'hotspot') {
          var cs = Data.SONG_MAP[msg.songId];
          pendingCallSong = msg.songId;
          pendingCallLeg = msg.src || null;
          trackPurpose = 'call';
          $('call-track-row').hidden = false;
          setTrackStatus('call', '🎵 ' + (cs ? cs.artist + ' — ' + cs.title : msg.songId) + ' — tap ▶ Play the song to hear it.');
        }
        break;
      case 'marks':
        if (msg.playerId === G.id) {
          G.marks = new Set(msg.marks);
          sfx('mark');
          if ($('screen-game').classList.contains('active')) renderGame();
        }
        break;
      case 'mark-denied':
        sfx('deny');
        toast(msg.reason === 'mic-stage'
          ? '🎤 That\u2019s a mic square — claim it on stage and perform to earn it.'
          : 'That mark was not accepted — the song was not called.');
        break;
      case 'claim-denied':
        sfx('deny');
        $('bingo-status').textContent = 'The host checked your card — not a BINGO yet.';
        toast('BINGO claim denied by the host check.');
        break;
      case 'claim-rejected':
        if (msg.playerId !== G.id) toast(msg.name + ' called BINGO — but the host check said no!');
        break;
      case 'winner':
        G.winner = { playerId: msg.playerId, name: msg.name, round: msg.round, points: msg.points };
        sfx('win'); confetti(70);
        showScores();
        banner('🎉 ' + msg.name + ' — BINGO! Round ' + msg.round + ' (+' + msg.points + ' pts)');
        break;
      case 'round-end':
        G.winner = null;
        G.roundEnded = msg.round;
        showScores();
        break;
      case 'round':
        show('screen-game');
        renderGame();
        toast('Round ' + msg.round + ' — ' + (msg.patternName || (msg.round === 2 ? '2 lines' : 'FULL CARD')) + ' to win!');
        break;
      case 'claim-stage':
        G.stageList = msg.holders;
        G.claims = [];
        G.passedClaim = false;
        showClaimStage(msg.songId, msg.holders);
        startStageCountdown(msg.seconds || 10, null);
        break;
      case 'claim-update':
        G.claims = msg.claims || [];
        if ($('claim-status')) $('claim-status').textContent = msg.status || '';
        paintClaimButtons();
        break;
      case 'claim-full':
        toast('Two players already claimed it — the battle is set.');
        break;
      case 'stage':
        G.stageList = msg.performers;
        G.stageMedia = msg.media || null;
        showStage(msg.songId, msg.performers, msg.mode);
        startStageCountdown(msg.seconds || 60, null, { gateOnSong: true });
        break;
      case 'stage-end':
        show('screen-game');
        renderGame();
        toast('Nobody claimed the mic — no square this time.');
        break;
      case 'stage-declined':
        show('screen-game');
        renderGame();
        toast(msg.name + ' passed on performing — no square.');
        break;
      case 'battle-forfeit':
        showBattleForfeit(msg.winnerName, msg.loserName);
        break;
      case 'vote-open':
        showVoteUI(msg.performers, msg.mode);
        startStageCountdown(msg.seconds || 20, null);
        break;
      case 'vote-count':
        updateVoteStatus(msg.count, msg.total, (typeof msg.a === 'number') ? { a: msg.a, b: msg.b } : null);
        break;
      case 'vote-result':
        if (msg.mode === 'battle') showBattleResult(msg.results, msg.winnerId);
        else showVoteResult(msg.performerId, { points: msg.points, breakdown: msg.breakdown }, msg.total, msg.square);
        break;
      case 'resume':
        show('screen-game');
        renderGame();
        break;
    }
  }

  /* ================= SHARED RENDERING ================= */

  function myView() {
    if (role === 'host' && H) {
      var p = selfPlayer();
      return {
        card: p ? p.card : null, marks: p ? p.marks : new Set([Core.CENTER]),
        called: H.called, round: H.round, players: publicPlayers(), isHost: true,
        patternId: H.patterns[H.round]
      };
    }
    if (role === 'guest' && G) {
      var s = G.state || { called: [], round: 1, players: [] };
      return { card: G.card, marks: G.marks, called: s.called || [], round: s.round || 1, players: s.players || [], isHost: false, patternId: s.patternId || null };
    }
    return { card: null, marks: new Set(), called: [], round: 1, players: [], isHost: false, patternId: null };
  }
  function myId() {
    if (role === 'host') { var p = selfPlayer(); return p ? p.id : null; }
    return G ? G.id : null;
  }
  function playerName(pid) {
    var v = myView();
    for (var i = 0; i < v.players.length; i++) if (v.players[i].id === pid) return v.players[i].name;
    if (role === 'host' && H && H.players[pid]) return H.players[pid].name;
    return 'Player';
  }

  /* ---- win-pattern picker (host only): name + mini grid + points ---- */
  var pickerSig = { lobby: '', scores: '' };
  function buildPatternGrid(el, round) {
    el.innerHTML = '';
    Core.PATTERNS.forEach(function (p) {
      var b = document.createElement('button');
      b.className = 'pattern-btn' + (H.patterns[round] === p.id ? ' selected' : '');
      b.title = p.blurb;
      var grid = '<span class="mini-grid" aria-hidden="true">';
      for (var i = 0; i < 25; i++) {
        grid += '<i class="' + (p.preview.indexOf(i) !== -1 ? 'on' : '') + '"></i>';
      }
      grid += '</span>';
      b.innerHTML = grid + '<span class="p-name">' + esc(p.name) + '</span>' +
        '<span class="p-pts">' + Core.patternPoints(p.id) + ' pts</span>';
      b.addEventListener('click', function () {
        H.patterns[round] = p.id;
        H.patternsPicked[round] = true;
        pickerSig.lobby = ''; pickerSig.scores = '';
        renderPatternPickers();
        hostBroadcastState();
        toast('Round ' + round + ' target: ' + p.name + ' — ' + Core.patternPoints(p.id) + ' pts to the winner');
      });
      el.appendChild(b);
    });
  }
  function renderPatternPickers() {
    var lp = $('pattern-picker'), sp = $('pattern-picker-scores');
    if (role !== 'host' || !H) { lp.hidden = true; sp.hidden = true; return; }
    lp.hidden = false;
    var sigL = 'r1:' + H.patterns[1];
    if (pickerSig.lobby !== sigL) { pickerSig.lobby = sigL; buildPatternGrid($('pattern-grid-lobby'), 1); }
    var next = H.round + 1;
    var showNext = next <= 3 && H.phase !== 'over' && $('screen-scores').classList.contains('active');
    sp.hidden = !showNext;
    if (showNext) {
      $('pattern-picker-scores-title').textContent = 'Round ' + next + ' target pattern';
      var sigS = 'r' + next + ':' + H.patterns[next];
      if (pickerSig.scores !== sigS) { pickerSig.scores = sigS; buildPatternGrid($('pattern-grid-scores'), next); }
    }
  }

  /* ---- lobby ---- */
  function renderLobby() {
    var info = $('lobby-room-info');
    $('hotspot-pair').hidden = !(role === 'host' && mode === 'hotspot');
    $('btn-start-game').hidden = role !== 'host';
    $('lobby-waiting').hidden = role === 'host';
    if (role === 'host') {
      $('lobby-title').textContent = mode === 'solo' ? 'Practice room' : 'Your room';
      if (mode === 'online') {
        info.innerHTML = 'Share this code with your players:<span class="room-code">' + esc(roomCode) + '</span>' +
          'Deck: <b>' + esc(H.deck.name) + '</b> • You are the host — you run the caller.';
      } else if (mode === 'hotspot') {
        info.innerHTML = 'Hotspot room — no internet needed. Pair each player below.<br>' +
          'Deck: <b>' + esc(H.deck.name) + '</b>';
      } else {
        info.innerHTML = 'Just you — practice the game solo.<br>Deck: <b>' + esc(H.deck.name) + '</b>';
      }
      renderLobbyPlayers(publicPlayers());
    } else {
      $('lobby-title').textContent = mode === 'online' ? 'Room ' + roomCode : 'Hotspot room';
      if (G && G.audience) {
        info.innerHTML = '👀 You are in the <b>audience</b> — no card, but you watch the stage and your votes count.<br>' +
          (G.deckName ? 'Deck: <b>' + esc(G.deckName) + '</b>' : 'Connecting…');
      } else {
        info.innerHTML = G && G.deckName
          ? 'Deck: <b>' + esc(G.deckName) + '</b> • Your card is dealt. Waiting for the host…'
          : 'Connecting…';
      }
      if (G && G.state) renderLobbyPlayers(G.state.players);
    }
    renderPatternPickers();
  }
  function renderLobbyPlayers(players) {
    var ul = $('lobby-players');
    ul.innerHTML = '';
    (players || []).forEach(function (p) {
      var li = document.createElement('li');
      if (!p.connected) li.className = 'offline';
      li.innerHTML = '<span class="p-name">' + esc(p.name) + '</span>' +
        (p.id === myId() ? ' <span class="p-meta">(you)</span>' : '') +
        '<span class="p-meta">' + (p.connected ? 'in the room' : 'left') + '</span>';
      ul.appendChild(li);
    });
    var audN = 0;
    if (role === 'host' && H) audN = Object.keys(H.audience).length;
    else if (G && G.state) audN = G.state.audience || 0;
    if (audN) {
      var li2 = document.createElement('li');
      li2.innerHTML = '<span class="p-name">👀 Audience</span><span class="p-meta">' + audN + ' watching + voting</span>';
      ul.appendChild(li2);
    }
    if ((!players || !players.length) && !audN) ul.innerHTML = '<li>No players yet…</li>';
  }

  /* ---- game ---- */
  var lastCallShown = null;
  function goalText(round) {
    return round === 1 ? '1 LINE' : round === 2 ? '2 LINES' : 'FULL CARD';
  }
  function updateCallerBar(songId, n, total, round) {
    var s = Data.SONG_MAP[songId];
    $('call-artist').textContent = s ? s.artist : 'Get ready…';
    $('call-title').textContent = s ? s.title : '';
    $('call-count').textContent = (n || 0) + ' CALLED';
    var pat = Core.patternById(activePatternId());
    $('call-goal').innerHTML = 'R' + round + ' <span class="star">★</span> ' +
      (pat ? esc(pat.name.toUpperCase()) : goalText(round));
    lastCallShown = songId;
  }

  /* The call countdown measures SONG time, not wall time (Nov 22,
     2026 ad gate): it accumulates only while this phone's gate says
     the song itself is playing, freezes for the length of any ad,
     and completes early if the track ends. `at` (the host's call
     timestamp) is kept for signature compatibility — the host's own
     bar behaves as before, since its call and its playback start
     together; a guest's bar now measures the guest's own song time
     once they tap Play, which is the time they actually hear. */
  function startCountdown(at) {
    clearInterval(countdownInt);
    var fill = $('countdown-fill');
    var secs = $('call-secs');
    var clock = Core.createGatedClock(CALL_SECONDS);
    countdownInt = setInterval(function () {
      var open = gateOpenFor('call');
      if (gateEndedFor('call')) clock.finish();
      var left = clock.tick(Date.now(), open);
      fill.style.width = ((1 - left / CALL_SECONDS) * 100) + '%';
      if (secs) secs.textContent = Math.ceil(left) + 's';
      if (left <= 0) clearInterval(countdownInt);
    }, 200);
  }

  function renderGoal(v) {
    var mine = null;
    (v.players || []).forEach(function (p) { if (p.id === myId()) mine = p; });
    var pat = Core.patternById(v.patternId);
    var isCustom = pat && v.patternId !== Core.ROUND_PATTERNS[v.round];
    if (isCustom) {
      // Host picked a shape: progress = closest variant of that shape.
      var prog = Core.patternProgress(v.marks, v.patternId);
      $('goal-label').textContent = pat.name.toUpperCase();
      $('goal-frac').textContent = prog.have + ' / ' + prog.need;
      $('goal-fill').style.width = (prog.need ? prog.have / prog.need * 100 : 0) + '%';
      return;
    }
    var best = 0, marks = 0;
    if (role === 'host' && H) { var sp = selfPlayer(); if (sp) { best = bestLine(sp.marks); marks = sp.marks.size - 1; } }
    else if (mine) { best = mine.best || 0; marks = mine.marks || 0; }
    var label = pat ? pat.name.toUpperCase() : goalText(v.round), frac, pct;
    if (v.round === 1) { frac = best + ' / 5'; pct = best / 5 * 100; }
    else if (v.round === 2) { var ln = mine ? (mine.lines || 0) : 0; frac = ln + ' / 2'; pct = ln / 2 * 100; }
    else { frac = marks + ' / 24'; pct = marks / 24 * 100; }
    $('goal-label').textContent = label;
    $('goal-frac').textContent = frac;
    $('goal-fill').style.width = pct + '%';
  }

  function renderGame() {
    var v = myView();
    $('host-controls').hidden = !v.isHost;
    if (v.called.length) {
      var cur = v.called[v.called.length - 1];
      if (lastCallShown !== cur) updateCallerBar(cur, v.called.length, null, v.round);
      else $('call-count').textContent = v.called.length + ' CALLED';
    }
    var isAud = role === 'guest' && G && G.audience;
    $('audience-note').hidden = !isAud;
    $('btn-bingo').style.display = isAud ? 'none' : '';
    if (isAud) {
      $('card').innerHTML = '';
      renderProgress(v.players);
      renderHistory(v.called);
      return;
    }
    renderCard(v);
    renderProgress(v.players);
    renderGoal(v);
    renderHistory(v.called);
    updateHealthLine();
  }

  /* Called-songs master list (most recent first) — the room's record
     of what has actually been called, like the pro music-bingo boards. */
  function renderHistory(called) {
    var list = $('history-list');
    if (!list) return;
    list.innerHTML = '';
    var songs = (called || []).slice().reverse();
    if (!songs.length) {
      list.innerHTML = '<li class="hist-empty">No songs called yet.</li>';
      return;
    }
    songs.forEach(function (sid, i) {
      var s = Data.SONG_MAP[sid];
      var li = document.createElement('li');
      li.innerHTML = '<span class="hist-n">' + (called.length - i) + '</span><span><b>' + esc(s ? s.artist : sid) + '</b> — ' + esc(s ? s.title : '') + '</span>';
      list.appendChild(li);
    });
  }

  function renderCard(v) {
    var el = $('card');
    el.innerHTML = '';
    if (!v.card) { el.innerHTML = '<p class="hint">Your card is on its way…</p>'; return; }
    var calledSet = new Set(v.called);
    // Shade the squares of the ACTIVE win shape (the variant this card
    // is closest to finishing) so players see what they're building.
    var targetSet = null;
    if (v.patternId) {
      targetSet = new Set(Core.patternProgress(v.marks, v.patternId).cells);
    }
    v.card.cells.forEach(function (songId, idx) {
      var cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.idx = idx;
      if (songId === Core.FREE) {
        cell.classList.add('free', 'marked');
        cell.innerHTML = '<span class="c-artist">FREE<br>SPACE</span>';
      } else {
        var s = Data.SONG_MAP[songId];
        var isMic = v.card.mic.indexOf(idx) !== -1;
        if (isMic) cell.classList.add('mic');
        if (targetSet && targetSet.has(idx) && !v.marks.has(idx)) cell.classList.add('target');
        if (v.marks.has(idx)) cell.classList.add('marked');
        else if (calledSet.has(songId)) cell.classList.add('called');
        cell.innerHTML =
          (isMic ? '<span class="mic-badge" title="Perform square"><svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path fill="#ff4fd8" d="M12 14.5a2.75 2.75 0 0 0 2.75-2.75V6a2.75 2.75 0 1 0-5.5 0v5.75A2.75 2.75 0 0 0 12 14.5z"/><path fill="#ff4fd8" d="M17.25 11.25a5.25 5.25 0 0 1-10.5 0H5.4a6.6 6.6 0 0 0 5.85 6.55v2.45H8.6v1.35h6.8v-1.35h-2.65v-2.45a6.6 6.6 0 0 0 5.85-6.55h-1.35z"/></svg></span>' : '') +
          '<span class="c-artist">' + esc(s ? s.artist : songId) + '</span>' +
          '<span class="c-title">' + esc(s ? s.title : '') + '</span>';
        cell.addEventListener('click', function () { onCellTap(idx, cell); });
      }
      el.appendChild(cell);
    });
    fitCardText();
  }

  // Shrink any cell text that would clip, so no name or title is ever cut.
  function fitCardText() {
    document.querySelectorAll('#card .c-artist, #card .c-title').forEach(function (el) {
      el.style.fontSize = '';
      var size = parseFloat(getComputedStyle(el).fontSize);
      var guard = 0;
      while (guard < 14 && size > 8.5 && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)) {
        size -= 0.5; el.style.fontSize = size + 'px'; guard++;
      }
    });
  }

  function onCellTap(idx, cellEl) {
    var v = myView();
    if (!v.card) return;
    var songId = v.card.cells[idx];
    if (songId === Core.FREE || v.marks.has(idx)) return;
    if (v.called.indexOf(songId) === -1) {
      sfx('deny');
      cellEl.classList.remove('shake');
      void cellEl.offsetWidth; // restart the animation
      cellEl.classList.add('shake');
      toast('Not called yet — a square only counts once its song is called.');
      return;
    }
    if (role === 'host') hostHandleMark(selfPlayer(), songId);
    else if (transport) transport.send({ t: 'mark', songId: songId });
  }

  function renderProgress(players) {
    if (!$('screen-game').classList.contains('active')) {
      var lobbyUl = $('lobby-players');
      if (lobbyUl && $('screen-lobby').classList.contains('active')) renderLobbyPlayers(players);
      return;
    }
    // Player chips over the card (Korey's design): initial avatar, a mini
    // bar of closest-line progress, and the x / 5 count.
    var wrap = $('chips');
    if (!wrap) return;
    wrap.innerHTML = '';
    (players || []).forEach(function (p) {
      var best = p.best || 0;
      var chip = document.createElement('div');
      chip.className = 'chip' + (p.connected ? '' : ' offline') + (p.id === myId() ? ' me' : '');
      chip.innerHTML = '<span class="chip-avatar">' + esc((p.name || '?').charAt(0).toUpperCase()) + '</span>' +
        '<span class="chip-bar"><span class="chip-fill" style="width:' + (best / 5 * 100) + '%"></span></span>' +
        '<span class="chip-frac">' + best + '/5</span>' +
        (p.score ? '<span class="chip-score">' + p.score + ' pts</span>' : '');
      wrap.appendChild(chip);
    });
  }

  /* ---- scores ---- */
  function showScores() {
    show('screen-scores');
    renderScores();
  }
  function renderScores() {
    var v = myView();
    var winner = role === 'host' ? H.winner : (G ? G.winner : null);
    var round = v.round;
    var isOver = role === 'host' ? (H.phase === 'over')
      : !!((winner && winner.round >= 3) || (G && G.roundEnded >= 3));
    if (winner) {
      $('scores-title').textContent = isOver ? '🏆 Final — ' + winner.name + ' takes it!' : '🎉 ' + winner.name + ' wins Round ' + winner.round + '!';
      $('scores-note').textContent = 'BINGO verified by the host against the call history. +' + winner.points + ' points.';
    } else {
      $('scores-title').textContent = isOver ? '🏆 Final scores' : 'Round ' + round + ' over';
      $('scores-note').textContent = 'No verified BINGO that round.';
    }
    var sorted = (v.players || []).slice().sort(function (a, b) { return b.score - a.score; });
    var ul = $('scores-list');
    ul.innerHTML = '';
    sorted.forEach(function (p, i) {
      var li = document.createElement('li');
      if (winner && p.id === winner.playerId) li.className = 'winner-row';
      li.innerHTML = '<span class="p-name">' + (i + 1) + '. ' + esc(p.name) + (p.id === myId() ? ' (you)' : '') + '</span>' +
        '<span class="p-meta"><span class="p-score">' + p.score + ' pts</span></span>';
      ul.appendChild(li);
    });
    $('scores-host-controls').hidden = role !== 'host';
    if (role === 'host') $('btn-next-round').hidden = isOver || H.phase === 'over';
    // Final standings: save the night on this device, and offer the
    // rematch (host) + the standings picture (everyone).
    var fin = $('scores-final-controls');
    if (fin) {
      fin.hidden = !isOver;
      $('btn-rematch').hidden = role !== 'host';
    }
    if (isOver) maybeSaveNight();
    renderPatternPickers();
  }

  /* ---- stage screens (shared host/guest rendering) ---- */
  var stageNow = [];   // [{id, name}] on stage right now (holders or performers)

  function showClaimStage(songId, holders) {
    sfx('stage');
    stopTrack();
    currentTrackSong = null;
    show('screen-stage');
    stageNow = holders || [];
    var s = Data.SONG_MAP[songId];
    $('stage-title').textContent = '🎤 MIC CHECK';
    $('stage-performer').textContent = stageNow.map(function (h) { return h.name; }).join(' • ');
    $('stage-song').textContent = s ? (s.artist + ' — ' + s.title) : songId;
    $('stage-note').textContent = 'This song is a MIC square. Claim it and perform it live on every screen to earn the square — pass, and it\u2019s gone.';
    $('stage-tiles').innerHTML = '';
    $('track-row').hidden = true;
    $('go-live-row').hidden = true;
    $('btn-decline').hidden = true;
    $('vote-panel').hidden = true;
    $('vote-result').hidden = true;
    $('claim-panel').hidden = false;
    $('claim-status').textContent = '';
    $('stage-host-controls').hidden = role !== 'host';
    $('btn-end-performance').hidden = true;
    $('btn-end-vote').hidden = true;
    $('btn-stage-continue').hidden = true;
    $('stage-count').textContent = String(CLAIM_SECONDS);
    $('stage-timer-fill').style.width = '0%';
    paintClaimButtons();
  }

  function paintClaimButtons() {
    var panel = $('claim-panel');
    if (!panel || panel.hidden) return;
    var st = role === 'host' ? (H && H.stage) : null;
    var claims = st ? st.claims : (G ? (G.claims || []) : []);
    var holders = st ? st.holders : stageNow.map(function (h) { return h.id; });
    var me = myId();
    var amHolder = holders.indexOf(me) !== -1;
    var iClaimed = claims.indexOf(me) !== -1;
    var iPassed = role !== 'host' && G && G.passedClaim;
    var battleSet = claims.length >= 2;
    $('btn-claim-mic').hidden = !amHolder;
    $('btn-pass-mic').hidden = !amHolder;
    $('btn-claim-mic').disabled = iClaimed || battleSet || !!iPassed;
    $('btn-pass-mic').disabled = iClaimed || !!iPassed;
    $('claim-text').textContent = !amHolder
      ? '🎤 ' + stageNow.map(function (h) { return h.name; }).join(' and ') + ' got the mic call…'
      : iPassed ? 'You passed — no square for you on this one.'
      : iClaimed ? (claims.length > 1 ? '⚔️ Battle set — get ready to perform!' : '🎤 You claimed it — get ready to perform!')
      : '🎤 Your mic song! Claim it and perform live to earn the square.';
  }

  function showStage(songId, list, mode) {
    sfx('stage');
    ensureTrackPlayer(); // a stage can be a guest's first track — start the player building now
    show('screen-stage');
    stageNow = list || [];
    var s = Data.SONG_MAP[songId];
    $('stage-title').textContent = mode === 'battle' ? '⚔️ LIP SYNC BATTLE' : '🎤 ON STAGE';
    $('stage-performer').textContent = stageNow.map(function (x) { return x.name; }).join(mode === 'battle' ? ' ⚔️ ' : '');
    $('stage-song').textContent = s ? (s.artist + ' — ' + s.title) : songId;
    $('stage-note').textContent = mode === 'battle'
      ? 'BATTLE! Same song, both live on every screen — the room picks the winner, and the winner takes the square.'
      : 'Performing LIVE on every screen in the room — the track plays for one full minute.';
    $('claim-panel').hidden = true;
    $('vote-panel').hidden = true;
    $('vote-result').hidden = true;
    buildTiles(stageNow, mode);
    startTrack(songId);
    $('stage-host-controls').hidden = role !== 'host';
    $('btn-end-performance').hidden = role !== 'host';
    $('btn-end-vote').hidden = true;
    $('btn-stage-continue').hidden = true;
    $('stage-count').textContent = String(STAGE_SECONDS);
    $('stage-timer-fill').style.width = '0%';
    var mySlot = stageNow.findIndex(function (x) { return x.id === myId(); });
    $('btn-decline').hidden = mySlot === -1;
    $('go-live-row').hidden = mySlot === -1;
    if (mySlot !== -1) startMyPerformance(mySlot);
  }

  function buildTiles(list, mode) {
    var wrap = $('stage-tiles');
    wrap.innerHTML = '';
    wrap.className = 'stage-tiles' + (mode === 'battle' ? ' battle' : '');
    (list || []).forEach(function (pf, i) {
      var tile = document.createElement('div');
      tile.className = 'tile' + (pf.id === myId() ? ' mine' : '');
      tile.dataset.pid = pf.id;
      tile.innerHTML = '<video autoplay playsinline></video>' +
        '<span class="tile-fallback">' + esc(pf.name) + '</span>' +
        '<span class="tile-name">' + esc(pf.name) + '</span>';
      wrap.appendChild(tile);
      if (mode === 'battle' && i === 0) {
        var vs = document.createElement('div');
        vs.className = 'vs-badge';
        vs.textContent = 'VS';
        wrap.appendChild(vs);
      }
    });
  }
  function tileFor(pid) {
    return document.querySelector('#stage-tiles .tile[data-pid="' + pid + '"]');
  }
  function attachStageStream(pid, stream) {
    var tile = tileFor(pid);
    if (!tile || !stream) return;
    var v = tile.querySelector('video');
    if (!v) return;
    v.srcObject = stream;
    tile.classList.add('live');
    var pr = v.play && v.play();
    if (pr && pr.catch) pr.catch(function () {});
  }

  /* opts.gateOnSong (performance countdown only): the seconds are
     SONG seconds — the clock accumulates only while the ad gate
     says the track itself is playing, so an ad mid-performance
     freezes the performer's clock instead of eating it. Claim and
     vote countdowns are not song-driven and stay wall-clock. */
  function startStageCountdown(seconds, onDone, opts) {
    clearInterval(stageInt);
    var gated = !!(opts && opts.gateOnSong);
    var clock = gated ? Core.createGatedClock(seconds) : null;
    var startedAt = Date.now();
    stageInt = setInterval(function () {
      var left;
      if (gated) {
        var open = gateOpenFor('stage');
        if (gateEndedFor('stage')) clock.finish();
        left = clock.tick(Date.now(), open);
      } else {
        left = Math.max(0, seconds - (Date.now() - startedAt) / 1000);
      }
      $('stage-count').textContent = Math.ceil(left);
      $('stage-timer-fill').style.width = ((1 - left / seconds) * 100) + '%';
      var ring = $('timer-ring');
      if (ring) ring.style.setProperty('--p', ((1 - left / seconds) * 100) + '%');
      if (left <= 0) {
        clearInterval(stageInt);
        if (onDone) onDone();
      }
    }, 200);
  }

  function showVoteUI(list, mode) {
    if (!$('screen-stage').classList.contains('active')) {
      // Guest may have navigated; the stage screen owns voting.
      show('screen-stage');
    }
    stopStageMedia();
    stopTrack();
    currentTrackSong = null;
    $('track-row').hidden = true;
    $('btn-decline').hidden = true;
    $('go-live-row').hidden = true;
    $('vote-result').hidden = true;
    var ids = (list || []).map(function (x) { return x.id; });
    var mine = ids.indexOf(myId()) !== -1;
    var battle = mode === 'battle';
    $('vote-heading').textContent = battle ? 'Who took this battle?' : 'How was that performance?';
    $('vote-solo').hidden = battle;
    var bar = $('battle-bar');
    if (battle && list && list.length >= 2) {
      bar.hidden = false;
      $('bb-name-a').textContent = list[0].name;
      $('bb-name-b').textContent = list[1].name;
      $('bb-n-a').textContent = '0';
      $('bb-n-b').textContent = '0';
      $('bb-fill-a').style.width = '50%';
      $('bb-fill-b').style.width = '50%';
    } else {
      bar.hidden = true;
    }
    var bv = $('vote-battle');
    bv.hidden = !battle;
    if (battle) {
      bv.innerHTML = '';
      (list || []).forEach(function (pf) {
        var b = document.createElement('button');
        b.className = 'btn vote-btn battle-pick';
        b.dataset.vote = pf.id;
        b.textContent = '🎤 ' + pf.name;
        bv.appendChild(b);
      });
    }
    document.querySelectorAll('.vote-btn').forEach(function (b) {
      b.classList.remove('picked');
      b.disabled = mine;
    });
    $('vote-panel').hidden = mine;
    $('vote-status').textContent = mine ? 'You performed — the room is voting…' : 'Tap your vote — one each!';
    if (role === 'host') {
      $('btn-end-performance').hidden = true;
      $('btn-end-vote').hidden = false;
      $('btn-stage-continue').hidden = true;
    }
  }
  function updateVoteStatus(count, total, split) {
    $('vote-status').textContent = count + ' of ' + total + ' votes in…';
    if (split && !$('battle-bar').hidden) {
      var cast = split.a + split.b;
      var pctA = cast ? (split.a / cast) * 100 : 50;
      $('bb-fill-a').style.width = pctA + '%';
      $('bb-fill-b').style.width = (100 - pctA) + '%';
      $('bb-n-a').textContent = split.a;
      $('bb-n-b').textContent = split.b;
    }
  }
  function showVoteResult(performerId, tally, total, squareEarned) {
    confetti(24);
    $('vote-panel').hidden = true;
    var el = $('vote-result');
    el.hidden = false;
    el.innerHTML = '🎤 <b>' + esc(playerName(performerId)) + '</b> earned <b>' + tally.points + ' points</b>' +
      (squareEarned ? '<br>🎯 And the mic square is <b>theirs</b> — performed and earned!' : '') +
      '<br>🔥 × ' + tally.breakdown.fire + ' &nbsp; 👏 × ' + tally.breakdown.solid + ' &nbsp; 😐 × ' + tally.breakdown.mid +
      '<br>Score now: <b>' + total + ' pts</b>';
    if (role === 'host') {
      $('btn-end-performance').hidden = true;
      $('btn-end-vote').hidden = true;
      $('btn-stage-continue').hidden = false;
    } else {
      el.innerHTML += '<br><span class="hint">Waiting for the host to bring the game back…</span>';
    }
  }

  function showBattleResult(results, winnerId) {
    confetti(36);
    $('vote-panel').hidden = true;
    var el = $('vote-result');
    el.hidden = false;
    // Crown the winner's tile; dim the loser's.
    var tiles = $('stage-tiles').children;
    for (var ti = 0; ti < tiles.length; ti++) {
      tiles[ti].classList.remove('winner', 'loser');
      if (winnerId) tiles[ti].classList.add(tiles[ti].dataset.pid === winnerId ? 'winner' : 'loser');
    }
    var winnerName = '';
    (results || []).forEach(function (r) { if (r.id === winnerId) winnerName = r.name; });
    var html = winnerId
      ? '⚔️ <b>' + esc(winnerName) + ' wins the battle — and takes the square! 🎯</b>'
      : '⚔️ <b>It\u2019s a tie — nobody takes the square.</b>';
    (results || []).forEach(function (r) {
      html += '<br>' + (r.id === winnerId ? '🏆 ' : '🎤 ') + '<b>' + esc(r.name) + '</b> — ' +
        r.votes + ' votes, <b>+' + r.points + ' pts</b> (score ' + r.total + ')';
    });
    el.innerHTML = html;
    if (role === 'host') {
      $('btn-end-performance').hidden = true;
      $('btn-end-vote').hidden = true;
      $('btn-stage-continue').hidden = false;
    } else {
      el.innerHTML += '<br><span class="hint">Waiting for the host to bring the game back…</span>';
    }
  }

  function showBattleForfeit(winnerName, loserName) {
    if (!$('screen-stage').classList.contains('active')) show('screen-stage');
    stopStageMedia();
    $('claim-panel').hidden = true;
    $('vote-panel').hidden = true;
    $('btn-decline').hidden = true;
    var el = $('vote-result');
    el.hidden = false;
    el.innerHTML = '🏆 <b>' + esc(winnerName) + '</b> wins by forfeit — ' + esc(loserName) +
      ' gave up the square.<br>🎯 The square goes to <b>' + esc(winnerName) + '</b>.';
    if (role === 'host') {
      $('btn-end-performance').hidden = true;
      $('btn-end-vote').hidden = true;
      $('btn-stage-continue').hidden = false;
    } else {
      el.innerHTML += '<br><span class="hint">Waiting for the host to bring the game back…</span>';
    }
  }

  /* ---- stage video: the performer's camera goes to the WHOLE room,
     TikTok-style — online via PeerJS media calls, hotspot via the
     pre-negotiated video slots the host forwards. Video only (no
     audio — the track plays on every phone, feedback stays away). -- */
  var myStream = null;
  var mySlot = -1;
  function startMyPerformance(slot) {
    mySlot = slot;
    if (myStream) { distributeMyStream(); return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      $('go-live-row').hidden = false;
      toast('No camera here — perform big for the room anyway!');
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then(function (stream) {
        // The stage ended while the camera was still starting
        // (stopStageMedia already ran and reset mySlot): keeping this
        // stream would leak a live camera that nothing ever stops.
        if (mySlot === -1) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
        myStream = stream;
        var tile = tileFor(myId());
        if (tile) {
          var v = tile.querySelector('video');
          v.srcObject = stream;
          v.muted = true;
          tile.classList.add('live');
        }
        $('go-live-row').hidden = true;
        distributeMyStream();
      })
      .catch(function () {
        $('go-live-row').hidden = false;
        toast('Camera off — perform big for the room anyway!');
      });
  }
  function distributeMyStream() {
    if (!myStream || !transport) return;
    var track = myStream.getVideoTracks()[0];
    if (mode === 'online' && transport.callMedia) {
      var roster = role === 'host' ? mediaRoster() : (G ? G.stageMedia : null);
      if (!roster) return;
      var me = transport.myMediaId();
      roster.forEach(function (id) {
        if (id && id !== me) transport.callMedia(id, myStream, { pid: myId(), slot: mySlot });
      });
    } else if (mode === 'hotspot' && track) {
      if (role === 'host' && transport.setHostTrack) transport.setHostTrack(mySlot, track);
      else if (transport.setMyTrack) transport.setMyTrack(mySlot, track);
    }
  }
  function stopStageMedia() {
    if (myStream) {
      myStream.getTracks().forEach(function (t) { t.stop(); });
      myStream = null;
    }
    mySlot = -1;
    stopTrack();
    if (!transport) return;
    if (transport.closeMedia) transport.closeMedia();
    if (mode === 'hotspot') {
      if (role === 'host' && transport.clearStageMedia) transport.clearStageMedia();
      else if (transport.clearMyStage) transport.clearMyStage();
    }
  }

  /* ---- stage media callbacks (wired into every transport) ---- */
  function onNetMedia(meta, stream) {
    if (meta && meta.pid) attachStageStream(meta.pid, stream);
  }
  function onHsTrack(pairingId, slot, track, stream) {
    var p = playerByPeer(pairingId);
    if (!p || !H || !H.stage || H.stage.sub !== 'perform') return;
    if (H.stage.performers[slot] !== p.id) return;
    if (transport && transport.setForward) transport.setForward(slot, track, pairingId);
    attachStageStream(p.id, stream);
  }
  function onHsStream(slot, stream) {
    var pf = stageNow[slot];
    if (!pf || pf.id === myId()) return;
    attachStageStream(pf.id, stream);
  }

  /* ---- track health check (Nov 22, 2026 — bulletproof the music).
     Korey's law: NO VERIFIED TRACK, NO CALL. When a game starts, the
     host's phone quietly probes every song in the call queue in the
     background — mirror first, then YouTube, then the backup upload —
     and remembers which source actually answered for each song. A song
     is only called once it has a verified-working source; if its first
     source died, the call silently plays from the one that answered.
     A song with NO working source is pulled from the queue before it
     can be called, and the host is told its name. The probes are light
     load tests only: a mirror leg loads the real embed page in a
     hidden frame (the same answer playback itself trusts), a YouTube
     leg asks the oEmbed endpoint (200 = the video exists AND may be
     embedded — the same check the Nov 20, 2026 audit used). Two probe
     lanes, short timeouts, and the session memory of dead mirror
     hosts keep the community mirrors from being hammered. Hotspot
     rooms skip all of this: no internet, no tracks — the room sings
     it out loud, as before. */
  var trackHealth = {};      // songId -> {state, prefLeg, failedLegs}
  var healthPromises = {};   // songId -> Promise (one probe per song per game)
  var healthStats = { checked: 0, total: 0, swapped: 0, pulled: [] };
  var healthRunId = 0;       // bumped per game + on leave; stale probes check it
  var healthSweepDone = false;

  /* The sources a song can play from, in the order playback prefers
     them: ad-free mirror of the primary upload, YouTube primary,
     ad-free mirror of the backup upload, YouTube backup. `yt2` is a
     second verified upload of the SAME song (see decks.js) — moving
     between legs never changes the song, only where it streams from. */
  function trackLegs(s) {
    var legs = [];
    if (!s) return legs;
    if (s.yt) { legs.push({ via: 'mirror', id: s.yt }); legs.push({ via: 'yt', id: s.yt }); }
    if (s.yt2 && s.yt2 !== s.yt) { legs.push({ via: 'mirror', id: s.yt2 }); legs.push({ via: 'yt', id: s.yt2 }); }
    return legs;
  }
  function songLabel(songId) {
    var s = Data.SONG_MAP[songId];
    return s ? (s.artist + ' — ' + s.title) : songId;
  }

  /* -- probe lanes: two hidden frames, handed out one at a time -- */
  var probeSlots = [{ busy: false }, { busy: false }];
  var probeWaiters = [];
  function probeSlotAcquire() {
    for (var i = 0; i < probeSlots.length; i++) {
      if (!probeSlots[i].busy) { probeSlots[i].busy = true; return Promise.resolve(i); }
    }
    return new Promise(function (res) { probeWaiters.push(res); });
  }
  function probeSlotRelease(i) {
    var f = $('probe-frame-' + i);
    if (f) { f.onload = null; try { f.src = 'about:blank'; } catch (e) {} }
    if (probeWaiters.length) probeWaiters.shift()(i); // hand the slot straight over
    else probeSlots[i].busy = false;
  }
  function clearProbeFrames() {
    probeWaiters = [];
    probeSlots.forEach(function (slot, i) {
      slot.busy = false;
      var f = $('probe-frame-' + i);
      if (f) { f.onload = null; try { f.src = 'about:blank'; } catch (e) {} }
    });
  }
  /* One mirror leg: load the real embed page in a probe frame. The
     page answering at all is the same signal playback itself trusts
     (see tryMirror); a timeout marks the host dead for the session,
     exactly like a playback timeout does, and the next host is tried. */
  function probeMirrorLeg(id) {
    var hosts = mirrorCandidates();
    if (!hosts.length) return Promise.resolve(false);
    function attempt(hi) {
      if (hi >= hosts.length) return Promise.resolve(false);
      var host = hosts[hi];
      return probeSlotAcquire().then(function (slot) {
        return new Promise(function (resolve) {
          var f = $('probe-frame-' + slot);
          if (!f) { probeSlotRelease(slot); resolve(false); return; }
          var settled = false;
          var timer = setTimeout(function () {
            if (settled) return;
            settled = true;
            mirrorDead[host] = true;
            if (mirrorHost === host) mirrorHost = null;
            probeSlotRelease(slot);
            resolve(false);
          }, 4500);
          f.onload = function () {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            // Give its player a beat, like tryMirror does, then free the frame.
            setTimeout(function () { probeSlotRelease(slot); }, 250);
            resolve(true);
          };
          try { f.src = 'https://' + host + '/embed/' + id + '?autoplay=1'; } catch (e) {
            clearTimeout(timer);
            settled = true;
            probeSlotRelease(slot);
            resolve(false);
          }
        }).then(function (ok) { return ok ? true : attempt(hi + 1); });
      });
    }
    return attempt(0);
  }
  /* One YouTube leg: oEmbed answers 200 only for a video that exists
     AND allows embedding; anything else (400/404/network) is a no. */
  function probeYtLeg(id) {
    var url = 'https://www.youtube.com/oembed?url=' +
      encodeURIComponent('https://www.youtube.com/watch?v=' + id) + '&format=json';
    var ctl = ('AbortController' in window) ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, 5000) : null;
    return fetch(url, ctl ? { signal: ctl.signal } : {})
      .then(function (res) { if (timer) clearTimeout(timer); return !!res.ok; })
      .catch(function () { if (timer) clearTimeout(timer); return false; });
  }
  function probeLeg(leg) {
    return leg.via === 'mirror' ? probeMirrorLeg(leg.id) : probeYtLeg(leg.id);
  }
  /* Probe a song's legs in preference order until one answers. */
  function probeSong(songId) {
    var legs = trackLegs(Data.SONG_MAP[songId]);
    if (!legs.length) return Promise.resolve({ state: 'dead', pref: -1, failed: {} });
    var failed = {};
    function next(i) {
      if (i >= legs.length) return Promise.resolve({ state: 'dead', pref: -1, failed: failed });
      return probeLeg(legs[i]).then(function (ok) {
        if (ok) return { state: 'ok', pref: i, failed: failed };
        failed[i] = true;
        return next(i + 1);
      });
    }
    return next(0);
  }
  /* Memoized per game: the background sweep, the pre-call gate, and
     playback itself all share the one probe result for a song. */
  function checkSong(songId) {
    var existing = trackHealth[songId];
    if (existing && existing.state !== 'checking') return Promise.resolve(existing);
    if (healthPromises[songId]) return healthPromises[songId];
    var runId = healthRunId;
    trackHealth[songId] = { state: 'checking' };
    var p = probeSong(songId).then(function (res) {
      var legs = trackLegs(Data.SONG_MAP[songId]);
      var entry = {
        state: res.state,
        prefLeg: res.pref >= 0 ? legs[res.pref] : null,
        failedLegs: res.failed
      };
      if (runId !== healthRunId) return entry; // an old game's probe — write nothing
      trackHealth[songId] = entry;
      healthStats.checked++;
      if (res.state === 'dead') pullSong(songId);
      updateHealthLine();
      return entry;
    });
    healthPromises[songId] = p;
    return p;
  }
  /* Dead-song law: out of the call queue before it can be called, and
     the host hears its name. Songs already called stay called. */
  function pullSong(songId) {
    if (!H) return;
    var kept = [];
    var removed = false;
    for (var i = 0; i < H.callSeq.length; i++) {
      if (i >= H.callIdx && H.callSeq[i] === songId) { removed = true; continue; }
      kept.push(H.callSeq[i]);
    }
    if (removed) H.callSeq = kept;
    if (healthStats.pulled.indexOf(songId) === -1) healthStats.pulled.push(songId);
    if (healthSweepDone) {
      banner('⚠️ No working track — pulled from the calls: ' + songLabel(songId));
    }
    updateHealthLine();
  }
  /* The background sweep: two lanes walk the call queue IN CALL ORDER
     (the next calls resolve first), one probe per song. */
  function startTrackHealth() {
    healthRunId++;
    trackHealth = {};
    healthPromises = {};
    healthStats = { checked: 0, total: H ? H.callSeq.length : 0, swapped: 0, pulled: [] };
    healthSweepDone = false;
    if (!H || mode === 'hotspot') { healthSweepDone = true; updateHealthLine(); return; }
    moveTrackHolderToBody(); // the probe frames must be rendered, not display:none
    updateHealthLine();
    var runId = healthRunId;
    var queue = H.callSeq.slice();
    var qi = 0;
    function lane() {
      if (runId !== healthRunId || qi >= queue.length) return Promise.resolve();
      var songId = queue[qi++];
      return checkSong(songId).then(lane, lane);
    }
    Promise.all([lane(), lane()]).then(function () {
      if (runId !== healthRunId) return;
      healthSweepDone = true;
      if (healthStats.pulled.length) {
        banner('⚠️ No working track — pulled from tonight\u2019s calls: ' +
          healthStats.pulled.map(songLabel).join(' • '));
      }
      updateHealthLine();
    });
  }
  /* The host's health line (game screen, under the host controls):
     how many songs are verified, how many sources got switched, how
     many songs were pulled. Unobtrusive; guests never see it. */
  function updateHealthLine() {
    var el = $('track-health');
    if (!el) return;
    if (role !== 'host' || mode === 'hotspot' || !healthStats.total) { el.hidden = true; return; }
    el.hidden = false;
    var txt = '🎵 Tracks checked ' + healthStats.checked + '/' + healthStats.total;
    if (healthStats.swapped) txt += ' • sources switched ' + healthStats.swapped;
    if (healthStats.pulled.length) txt += ' • pulled ' + healthStats.pulled.length + ' (no working track)';
    el.textContent = txt;
  }
  /* Playback order for a song: the verified source first (this phone's
     own probe result, or the host's hint broadcast to guests), legs the
     probe proved dead skipped, the rest in preference order behind it.
     If everything probed dead, the full list is returned anyway —
     playback makes one last honest attempt before failing out loud. */
  function orderedLegs(songId, prefHint) {
    var legs = trackLegs(Data.SONG_MAP[songId]);
    if (!legs.length) return legs;
    var h = trackHealth[songId];
    var first = (h && h.state === 'ok' && h.prefLeg) ? h.prefLeg : (prefHint || null);
    var failed = (h && h.failedLegs) || {};
    var out = [];
    if (first) out.push(first);
    legs.forEach(function (leg, i) {
      if (first && leg.via === first.via && leg.id === first.id) return;
      if (failed[i]) return;
      out.push(leg);
    });
    return out.length ? out : legs;
  }

  /* ---- the track player (YouTube IFrame API — Nov 20, 2026 repair).
     Korey's rule: EVERY song has to actually play. So the player now
     tracks REAL state: "Track playing" shows only after YouTube reports
     PLAYING. If an upload refuses to embed (errors 101/150 and friends)
     it auto-falls back to the song's verified backup upload (yt2), and
     if that fails too it says so honestly and links out to YouTube.
     Two purposes share the one player:
       'stage' — the performance track (full minute, on the stage screen)
       'call'  — the called song, played out loud on the caller's phone;
                 other phones get a "▶ Play the song" button (their tap
                 is the gesture browsers require for sound). -- */
  var trackTimer = null;
  var currentTrackSong = null;
  var trackPurpose = 'stage';   // 'stage' | 'call'
  var pendingCallSong = null;   // guest side: latest called song awaiting a tap
  var pendingCallLeg = null;    // guest side: host's verified source for that call
  var trackPlayer = null;       // the ONE persistent YT.Player (never destroyed)
  var trackPlayerReady = false;
  var trackPlayerCreating = false;
  var trackPlayerCreatingAt = 0;
  var trackWant = null;         // {songId, ids:[], legs:[], legIdx, purpose, playing, via}
  var trackWatchdog = null;

  /* ---- the ad gate (Nov 22, 2026 — Korey: the app should "only
     play when a song is playing, not the ad"). ONE source of truth
     for "the SONG is audibly playing right now": the pure gate in
     core.js decides from live player samples, and every song-driven
     timer (the 60s call countdown, the stage performance countdown)
     accumulates only while it says yes — an ad freezes the game
     clock and raises the "Ad playing — game paused" banner until
     the song itself is back. YouTube legs: the gate reads the real
     player (state, duration, playhead) — an ad betrays itself by
     reporting the AD's duration instead of the song's. Mirror legs:
     the embed is cross-origin, so no media state is readable from
     here at all; the verdict rides mirrorActive, the same
     load+start-beat signal playback itself already trusts, and
     mirror embeds serve no ads, so a live mirror is the song. ---- */
  var playbackGate = Core.createPlaybackGate();
  var gatePoll = null;

  function songActuallyPlaying() {
    if (!trackWant) { updateAdBanner(false); return false; }
    var s = { via: trackWant.via, ytState: null, duration: null, currentTime: null, mirrorLive: false };
    if (trackWant.via === 'mirror') {
      s.mirrorLive = mirrorActive;
    } else if (trackWant.via === 'yt' && trackPlayer) {
      try { s.ytState = trackPlayer.getPlayerState(); } catch (e) {}
      try { s.duration = trackPlayer.getDuration(); } catch (e) {}
      try { s.currentTime = trackPlayer.getCurrentTime(); } catch (e) {}
    }
    playbackGate.sample(s, Date.now());
    var adNow = playbackGate.reason() === 'ad';
    updateAdBanner(adNow);
    // A marathon ad is not a pause, it is a dead leg: after the cap
    // of CONTINUOUS ad time, fail over to the next source like any
    // other dead source. On the last leg there is nowhere to fail
    // to — the clock simply stays frozen until the song comes back.
    if (adNow && playbackGate.adMs() >= Core.AD_FREEZE_CAP_MS &&
        trackWant.legIdx < trackWant.legs.length - 1) {
      advanceLeg(trackWant); // advanceLeg resets the gate for the new leg
    }
    return playbackGate.isOpen();
  }
  function updateAdBanner(showAd) {
    var b = $('ad-banner');
    if (!b) return;
    b.hidden = !(showAd && trackWant);
  }
  function startGatePoll() {
    if (gatePoll) return;
    gatePoll = setInterval(function () {
      if (!trackWant) { stopGatePoll(); return; }
      songActuallyPlaying();
    }, 250);
  }
  function stopGatePoll() {
    clearInterval(gatePoll);
    gatePoll = null;
    updateAdBanner(false);
  }
  /* Timers ask here. The gate governs a timer only when THIS phone
     is actually playing that purpose's track: hotspot rooms have no
     local playback (the room hears the song out loud), and a guest
     who has not tapped Play yet has no player to judge — in both
     cases the timer runs as it always did. */
  function gateOpenFor(purpose) {
    if (mode === 'hotspot') return true;
    if (!trackWant || trackWant.purpose !== purpose) return true;
    return songActuallyPlaying();
  }
  function gateEndedFor(purpose) {
    return !!trackWant && trackWant.purpose === purpose &&
      playbackGate.reason() === 'ended';
  }

  /* ---- ad-free mirror (Invidious) ----
     Korey 2026-11-21: no ads. The tracks live on YouTube, and YouTube's
     own player carries the ads with no off switch — so the game first
     tries an open-source Invidious mirror of the same video: same song,
     no ads, no Google tracking. Mirrors are community servers and
     YouTube fights them (only a handful of public ones are left), so
     this layer is built to fail soft: a short per-server budget, a
     session memory of the server that answered, and an instant
     fall-through to the regular YouTube player — the game is never
     worse off than YouTube alone. Sound cannot be read across origins,
     so if a mirror loads but the phone keeps it silent under autoplay
     rules, the status says so and the ▶ Play tap rescues the song onto
     the YouTube player, whose sound path is proven. */
  /* The official public-instance list (docs.invidious.io, checked
     2026-11-21) has exactly four entries. Only two are wired in:
       - invidious.tiekoetter.com — VERIFIED from here: its /embed/
         page for a real pool song serves an actual <video> player.
       - invidious.nerdvpn.de — on the official list; unreachable from
         the build machine today, but its failure mode is silence (a
         timeout), which the chain skips safely.
     Deliberately EXCLUDED: yt.chocolatemoo53.com and inv.nadeko.net.
     Both sit behind anti-bot CAPTCHA walls (nadeko's is documented;
     chocolatemoo53's embed URL served a challenge page, verified
     2026-11-21) — a challenge page still fires the frame's load
     event, so the game would claim "playing" over a CAPTCHA. Never
     add a host whose embed answer is a wall. */
  var MIRROR_HOSTS = ['invidious.tiekoetter.com', 'invidious.nerdvpn.de'];
  var mirrorHost = null;      // the server that answered this session
  var mirrorDead = {};        // host -> true (failed this session)
  var mirrorTimer = null;
  var mirrorActive = false;

  function stopMirror() {
    clearTimeout(mirrorTimer);
    mirrorTimer = null;
    mirrorActive = false;
    var f = $('inv-frame');
    if (f) {
      f.onload = null;
      try { f.src = 'about:blank'; } catch (e) {}
    }
  }
  function mirrorCandidates() {
    var list = [];
    if (mirrorHost && !mirrorDead[mirrorHost]) list.push(mirrorHost);
    MIRROR_HOSTS.forEach(function (h) {
      if (list.indexOf(h) === -1 && !mirrorDead[h]) list.push(h);
    });
    return list;
  }
  /* Dispatch the want's current leg: a mirror leg goes to the mirror
     chain, a YouTube leg to the persistent player. */
  function startLeg(want) {
    var leg = want.legs[want.legIdx];
    if (!leg) { failTrack(); return; }
    if (leg.via === 'mirror') startMirror(want);
    else { want.via = 'yt'; driveTrackPlayer(); }
  }
  /* Move a want to its next source for the SAME song and keep going —
     no host action, no dead air beyond the switch itself. The swap is
     counted on the host's health line and the status says plainly
     what happened. Legs are finite, so this always terminates: the
     last leg failing lands in failTrack's honest message. */
  function advanceLeg(want) {
    if (trackWant !== want) return;
    playbackGate.reset(); // the new leg is a different upload — its duration latch starts fresh
    var prev = want.legs[want.legIdx];
    want.legIdx++;
    if (want.legIdx >= want.legs.length) { failTrack(); return; }
    want.playing = false;
    want.retried = false; // the new source gets its own 3s nudge
    clearTimeout(trackWatchdog);
    clearTimeout(trackRetryTimer);
    clearTimeout(trackSoundTimer);
    stopMirror();
    healthStats.swapped++;
    updateHealthLine();
    var nl = want.legs[want.legIdx];
    if (prev && nl.id !== prev.id) {
      setTrackStatus(want.purpose, 'That upload won\u2019t play here — trying the backup track…');
    } else if (prev && prev.via === 'mirror' && nl.via === 'yt') {
      setTrackStatus(want.purpose, 'Ad-free mirror is down — playing on YouTube (ads possible)');
    } else {
      setTrackStatus(want.purpose, 'That source stalled — switching…');
    }
    startLeg(want);
  }
  function startMirror(want) {
    moveTrackHolderToBody();
    var hosts = mirrorCandidates();
    if (!hosts.length) { advanceLeg(want); return; }
    want.via = 'mirror';
    tryMirror(want, hosts, 0);
  }
  function tryMirror(want, hosts, i) {
    if (trackWant !== want || want.via !== 'mirror') return;
    if (i >= hosts.length) {
      // Every mirror failed for this source — move down the leg list
      // (YouTube for this upload, then the backup upload's sources).
      advanceLeg(want);
      return;
    }
    var host = hosts[i];
    var f = $('inv-frame');
    if (!f) { advanceLeg(want); return; }
    var settled = false;
    clearTimeout(mirrorTimer);
    mirrorTimer = setTimeout(function () {
      if (settled) return;
      settled = true;
      mirrorDead[host] = true;
      if (mirrorHost === host) mirrorHost = null;
      f.onload = null;
      tryMirror(want, hosts, i + 1);
    }, 4000);
    f.onload = function () {
      if (settled) return;
      settled = true;
      clearTimeout(mirrorTimer);
      // The mirror page loaded. Give its player a beat to start, then
      // call it playing — with the honest rescue line attached, since
      // actual sound can't be verified across origins.
      mirrorTimer = setTimeout(function () {
        if (trackWant !== want || want.via !== 'mirror') return;
        mirrorHost = host;
        mirrorActive = true;
        want.playing = true;
        clearTimeout(trackWatchdog);
        if (want.purpose === 'stage') setTrackEq(true);
        setTrackStatus(want.purpose, '🎵 Track playing — ad-free mirror. No sound? Tap ▶ Play the song.');
      }, 900);
    };
    try { f.src = 'https://' + host + '/embed/' + want.legs[want.legIdx].id + '?autoplay=1'; } catch (e) {}
  }

  var ytApiPromise = null;
  function ytApi() {
    if (window.YT && YT.Player) return Promise.resolve(YT);
    if (!ytApiPromise) {
      ytApiPromise = new Promise(function (resolve) {
        var prev = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = function () {
          if (prev) try { prev(); } catch (e) {}
          resolve(window.YT);
        };
        var tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      });
    }
    return ytApiPromise;
  }

  function trackStatusEl(purpose) {
    return purpose === 'call' ? $('call-track-status') : $('track-status');
  }
  function setTrackStatus(purpose, text) {
    var el = trackStatusEl(purpose);
    if (el) el.textContent = text;
  }
  function setTrackEq(on) {
    var eq = $('track-eq');
    if (eq) eq.hidden = !on;
  }
  function armTrackWatchdog() {
    clearTimeout(trackWatchdog);
    trackWatchdog = setTimeout(function () {
      if (trackWant && !trackWant.playing) {
        // Six seconds with no PLAYING is a stall, not a pause: move to
        // the next source for the same song instead of giving up. Only
        // the last source gets the old tap prompt.
        if (trackWant.legIdx < trackWant.legs.length - 1) advanceLeg(trackWant);
        else setTrackStatus(trackWant.purpose, 'Tap ▶ Play the song to hear it.');
      }
    }, 6000);
  }
  /* The player element starts inside #screen-stage, and every non-active
     screen is display:none — an embed inside a display:none subtree has
     no layout box and silently stalls: loadVideoById/playVideo are
     accepted by the JS handle but PLAYING never arrives and no error
     fires (the Nov 20 play-test failure: the first song played while
     the stage screen was up, every later song went into the stalled
     hidden embed, and the Play button drove that same dead-feeling
     player). The holder's own CSS parks it off-screen (-9999px) but
     still RENDERED — that only works with no display:none ancestor, so
     the holder is moved to <body> before the player is created. */
  var trackHolderMoved = false;
  function moveTrackHolderToBody() {
    if (trackHolderMoved) return;
    trackHolderMoved = true;
    var holder = $('yt-holder');
    if (holder && holder.parentNode !== document.body) {
      document.body.appendChild(holder);
    }
    var inv = $('inv-holder');
    if (inv && inv.parentNode !== document.body) {
      document.body.appendChild(inv);
    }
    var probe = $('probe-holder');
    if (probe && probe.parentNode !== document.body) {
      document.body.appendChild(probe);
    }
  }
  /* Create the ONE player. Two construction paths:
       - SYNCHRONOUS, when the API is already on the page (it is
         preloaded at startup): the player is born inside the caller's
         own stack — the Start-game tap calls ensureTrackPlayer()
         directly — so by the first Call the player exists and is READY,
         and that first load is issued inside the Call tap itself.
       - ASYNC fallback (API not loaded yet): construct when the API
         promise resolves; the want stays queued in trackWant and
         onReady drives it.
     The old code ONLY had the async path, and it was only entered from
     the first track request — so the first song's loadVideoById was
     always issued from the onReady callback, two async hops away from
     any tap, with no gesture attached; the embed declined to start
     with sound and sat CUED while the app waited for a PLAYING that
     could never come. The player is never destroyed afterwards;
     stopTrack only stops the video. */
  function createTrackPlayer(YT) {
    if (trackPlayer) return;
    trackPlayer = new YT.Player('yt-player', {
      width: 320, height: 180,
      playerVars: { controls: 0, disablekb: 1, playsinline: 1, rel: 0 },
      events: {
        onReady: function () {
          trackPlayerReady = true;
          // Baseline volume from birth: script-driven embeds can come
          // up muted (see unmuteTrackPlayer) — start at full volume.
          try { trackPlayer.setVolume(100); } catch (e) {}
          driveTrackPlayer(); // flush the queued track, if any
        },
        onStateChange: onTrackState,
        onError: onTrackError
      }
    });
  }
  function ensureTrackPlayer() {
    if (trackPlayer) return;
    if (trackPlayerCreating && Date.now() - trackPlayerCreatingAt < 12000) return;
    // A creation attempt older than 12s with no player is wedged (the
    // API script blocked or lost) — the old code left the flag set
    // forever, so no song could ever load again that session. Allow a
    // fresh attempt instead.
    trackPlayerCreating = true;
    trackPlayerCreatingAt = Date.now();
    moveTrackHolderToBody();
    if (window.YT && YT.Player) { createTrackPlayer(window.YT); return; }
    ytApi().then(function (YT) { createTrackPlayer(YT); });
  }
  /* Issue the current trackWant to the persistent player. Safe to call
     at any time: kicks off creation if needed, no-ops while the player
     is not ready yet (the want stays queued — never dropped). */
  function driveTrackPlayer() {
    if (!trackWant) return;
    if (!trackPlayer) { ensureTrackPlayer(); return; }
    if (!trackPlayerReady) return; // onReady will call us again
    // Load AND explicitly play, in the same stack. loadVideoById alone
    // only ASKS the embed to autoplay; when the embed declines, the
    // video sits CUED and the old code never issued a play call to
    // rescue it — the watchdog just relabelled the stall after 6s.
    clearTimeout(trackSoundTimer); // a new load supersedes any pending sound check
    try { trackPlayer.loadVideoById(trackWant.legs[trackWant.legIdx].id); } catch (e) {}
    try { trackPlayer.playVideo(); } catch (e) {}
    unmuteTrackPlayer(); // script-driven starts come up MUTED — force sound
    armTrackWatchdog();
    armTrackRetry(trackWant);
  }
  /* Force the embed AUDIBLE. A script-driven loadVideoById/playVideo
     (anything but a direct click on the embed itself) starts MUTED on
     YouTube: the player state still reports PLAYING, so the app used to
     announce "🎵 Track playing…" while the room heard nothing — Korey's
     phone, Nov 20, 2026: status said playing, zero sound, and the code
     never called unMute()/setVolume() anywhere. Every load path now
     unmutes, and the PLAYING state is verified for real sound below. */
  function unmuteTrackPlayer() {
    if (!trackPlayer) return;
    try { trackPlayer.unMute(); } catch (e) {}
    try { trackPlayer.setVolume(100); } catch (e) {}
  }
  /* ~800ms after PLAYING (or after a Play-button tap), confirm the
     embed is REALLY audible. If it is still muted or at volume 0, say
     so honestly — "playing muted" — instead of claiming "Track
     playing…" into silence; the ▶ Play tap can still force sound,
     because a real tap is a full user gesture. */
  var trackSoundTimer = null;
  function armTrackSoundVerify(want) {
    clearTimeout(trackSoundTimer);
    trackSoundTimer = setTimeout(function () {
      if (trackWant !== want || !trackPlayer) return;
      var playing = want.playing;
      if (!playing) {
        try { playing = trackPlayer.getPlayerState() === 1; } catch (e) {} // 1 = PLAYING
        if (playing) want.playing = true;
      }
      if (!playing) return; // the 6s watchdog owns the not-playing case
      var muted = false, vol = 100;
      try { muted = !!trackPlayer.isMuted(); } catch (e) {}
      try { vol = trackPlayer.getVolume(); } catch (e) {}
      if (typeof vol !== 'number') vol = 100;
      if (muted || vol === 0) {
        setTrackStatus(want.purpose, 'Track is playing muted — tap ▶ Play the song for sound');
      } else {
        setTrackStatus(want.purpose, '🎵 Track playing…');
      }
    }, 800);
  }
  /* One nudge for an embed that cued but never started: 3s after a
     load with no PLAYING, re-issue playVideo() once — before the 6s
     watchdog gives up and shows the tap prompt. */
  var trackRetryTimer = null;
  function armTrackRetry(want) {
    clearTimeout(trackRetryTimer);
    trackRetryTimer = setTimeout(function () {
      if (trackWant === want && !want.playing && !want.retried && trackPlayer && trackPlayerReady) {
        want.retried = true;
        try { trackPlayer.playVideo(); } catch (e) {}
      }
    }, 3000);
  }
  function onTrackState(e) {
    if (!trackWant) return;
    if (e.data === YT.PlayerState.PLAYING) {
      trackWant.playing = true;
      clearTimeout(trackWatchdog);
      clearTimeout(trackRetryTimer);
      // PLAYING is not the same as AUDIBLE: a script-driven start can
      // be playing muted. Unmute now, then let the sound verify set
      // the status — "🎵 Track playing…" only once sound is confirmed.
      unmuteTrackPlayer();
      armTrackSoundVerify(trackWant);
      if (trackWant.purpose === 'stage') setTrackEq(true);
    } else if (e.data === YT.PlayerState.ENDED && trackWant.purpose === 'stage') {
      setTrackEq(false);
    }
  }
  function onTrackError() {
    if (!trackWant || !trackPlayer) return;
    // An upload that refuses to embed (errors 101/150 and friends)
    // moves the song to its next source automatically — the backup
    // upload included — and only a song out of sources fails out loud.
    advanceLeg(trackWant);
  }
  function failTrack() {
    clearTimeout(trackRetryTimer);
    stopGatePoll();
    playbackGate.reset();
    var s = trackWant ? Data.SONG_MAP[trackWant.songId] : null;
    var purpose = trackWant ? trackWant.purpose : trackPurpose;
    var el = trackStatusEl(purpose);
    setTrackEq(false);
    if (el && s && s.yt) {
      el.innerHTML = 'Couldn\u2019t play this track here — ' +
        '<a href="https://www.youtube.com/watch?v=' + s.yt + '" target="_blank" rel="noopener">tap to open it on YouTube</a>';
    } else if (el) {
      el.textContent = 'Couldn\u2019t play this track here.';
    }
    trackWant = null;
  }

  /** Load + play a song's track for the given purpose ('stage'|'call').
      Sources are walked as LEGS (see trackLegs): the health check's
      verified source goes first when there is one, then the rest in
      preference order; any leg that errors or stalls fails over to
      the next automatically (advanceLeg). prefHint is the host's
      verified source, broadcast to guests with the call. */
  function playTrack(songId, purpose, prefHint) {
    var s = Data.SONG_MAP[songId];
    stopTrack();
    currentTrackSong = songId;
    trackPurpose = purpose;
    if (purpose === 'stage') $('track-row').hidden = false;
    else $('call-track-row').hidden = false;
    setTrackStatus(purpose, '');
    if (!s || !s.yt) {
      setTrackStatus(purpose, 'No track link for this one — the room sings it!');
      return;
    }
    if (mode === 'hotspot') {
      setTrackStatus(purpose, 'Hotspot has no internet — play the song out loud in the room!');
      return;
    }
    var legs = orderedLegs(songId, prefHint);
    var ids = [];
    legs.forEach(function (leg) { if (ids.indexOf(leg.id) === -1) ids.push(leg.id); });
    trackWant = { songId: songId, ids: ids, legs: legs, legIdx: 0, purpose: purpose, playing: false, retried: false, via: null };
    playbackGate.reset();
    startGatePoll();
    setTrackStatus(purpose, 'Loading the track…');
    var want = trackWant;
    startLeg(want);
    // If the API itself never arrives (blocked network), fail honestly.
    // The mirror chain gets its own budget first, so this only judges
    // the YouTube leg once the song has fallen through to it — and any
    // source still untried gets its turn before the song gives up.
    setTimeout(function () {
      if (trackWant === want && !want.playing && want.via === 'yt' && !trackPlayerReady) {
        if (want.legIdx < want.legs.length - 1) advanceLeg(want);
        else failTrack();
      }
    }, 15000);
  }

  /** Stage performance track: plays for the full minute, then stops. */
  function startTrack(songId) {
    playTrack(songId, 'stage');
    if (mode !== 'hotspot') {
      // Wall-clock backstop so the track never outlives the stage.
      // The stage clock now freezes during ads (ad gate), so a frozen
      // performance legitimately runs past the old hard stop: re-check
      // a few times before killing, with a hard cap on the grace.
      var rearms = 0;
      var killStageTrack = function () {
        if (rear++ < 8 && H && H.phase === 'stage' && H.stage && H.stage.sub === 'perform') {
          trackTimer = setTimeout(killStageTrack, 15000);
          return;
        }
        stopTrack();
      };
      trackTimer = setTimeout(killStageTrack, (STAGE_SECONDS + 8) * 1000); // never outlives the stage
    }
  }
  function stopTrack() {
    clearTimeout(trackTimer);
    trackTimer = null;
    clearTimeout(trackWatchdog);
    trackWatchdog = null;
    clearTimeout(trackRetryTimer);
    clearTimeout(trackSoundTimer);
    stopGatePoll();
    playbackGate.reset();
    stopMirror();
    trackWant = null;
    if (trackPlayer && trackPlayer.stopVideo) {
      try { trackPlayer.stopVideo(); } catch (e) {}
    }
    setTrackEq(false);
  }
  /** The Play button spends the tap DIRECTLY on the live player: load
      the wanted upload AND play it, right here in the tap's own call
      stack, with no state check in between. (The old handler gated its
      only playVideo() on getVideoData() already naming the wanted
      video — in the stalled state that data is exactly what's missing
      or stale, so the tap fell through to re-issuing the same
      implicit-autoplay load that had just stalled, and playVideo() was
      never called at all. The button looked dead because, on that
      path, it was.) If the track is already playing, a tap changes
      nothing. With no live want, the tap (re)starts the current
      song's track from the top. */
  function tapPlayTrack() {
    var songId = (trackWant && trackWant.songId) || currentTrackSong || pendingCallSong;
    if (!songId) return;
    if (trackWant && trackWant.songId === songId && trackWant.via === 'mirror') {
      // The mirror has this song (or is still fetching it) but the tap
      // means the room isn't hearing it — autoplay rules can hold a
      // cross-origin frame silent. Spend the tap on the YouTube
      // player instead: its sound path is proven.
      var curLeg = trackWant.legs[trackWant.legIdx];
      var target = -1;
      for (var li = 0; li < trackWant.legs.length; li++) {
        if (trackWant.legs[li].via === 'yt' && trackWant.legs[li].id === curLeg.id) { target = li; break; }
      }
      stopMirror();
      if (target === -1) { advanceLeg(trackWant); return; }
      trackWant.legIdx = target;
      trackWant.via = 'yt';
      trackWant.playing = false;
      playbackGate.reset(); // new source — the gate's duration latch starts fresh
      setTrackStatus(trackWant.purpose, 'Loading the track…');
      driveTrackPlayer();
      return;
    }
    if (trackWant && trackWant.songId === songId && trackWant.playing) return;
    if (trackPlayer && trackWant && trackWant.songId === songId) {
      if (trackPlayerReady) {
        setTrackStatus(trackWant.purpose, 'Loading the track…');
        try { trackPlayer.loadVideoById(trackWant.legs[trackWant.legIdx].id); } catch (e) {}
        try { trackPlayer.playVideo(); } catch (e) {}
        // This tap is a real user gesture — the strongest there is:
        // spend it on SOUND too, unconditionally, in this same stack.
        unmuteTrackPlayer();
        armTrackSoundVerify(trackWant);
        armTrackWatchdog();
        armTrackRetry(trackWant);
      } else {
        driveTrackPlayer(); // not ready yet — the want stays queued for onReady
      }
      return;
    }
    playTrack(songId, trackPurpose, songId === pendingCallSong ? pendingCallLeg : null);
  }

  /* ================= ROOM SETUP / TEARDOWN ================= */

  function enterHost(newMode, newTransport, code) {
    role = 'host';
    mode = newMode;
    transport = newTransport;
    roomCode = code || '';
    H = newHostState(deckById(selectedDeckId));
    hostAddPlayer('self', myName, true);
    show('screen-lobby');
    renderLobby();
  }

  function leaveRoom(silent) {
    clearInterval(countdownInt);
    clearInterval(stageInt);
    stopGatePoll();
    clearTimeout(autoResumeTimer);
    healthRunId++; // in-flight track probes from this room write nothing now
    clearProbeFrames();
    callGatePending = false;
    if (hsHelloTimer) { clearInterval(hsHelloTimer); hsHelloTimer = null; }
    stopStageMedia();
    if (transport) {
      // Detach the close callback first: our own close() otherwise
      // reports back as "The host closed the room." on a voluntary leave.
      if (transport.onClose) { try { transport.onClose(function () {}); } catch (e) {} }
      try { transport.close(); } catch (e) {}
    }
    transport = null; role = null; mode = null; H = null; G = null; roomCode = '';
    nightSaveId = null;
    lastCallShown = null;
    show('screen-home');
    if (!silent) toast('You left the room.');
  }

  /* ---- online ---- */
  $('btn-host-online').addEventListener('click', function () {
    if (!requireName()) return;
    var code = Core.makeRoomCode();
    toast('Opening your room…');
    Net.createPeerHost(code, { onMessage: hostOnMessage, onJoin: hostOnJoin, onLeave: hostOnLeave, onError: function () {}, onMedia: onNetMedia })
      .then(function (t) { enterHost('online', t, code); toast('Room ' + code + ' is open — share the code!'); })
      .catch(function (err) { toast(err.message); });
  });

  $('btn-join-online').addEventListener('click', function () {
    if (!requireName()) return;
    var code = Core.normalizeRoomCode($('join-code').value);
    if (code.length !== 4) { toast('Enter the 4-letter room code.'); return; }
    toast('Joining room ' + code + '…');
    Net.createPeerGuest(code, { onMessage: guestOnMessage, onClose: guestDisconnected, onMedia: onNetMedia })
      .then(function (t) {
        role = 'guest'; mode = 'online'; transport = t; roomCode = code;
        G = { id: null, name: myName, card: null, marks: new Set([Core.CENTER]), state: null, deckName: '', winner: null };
        t.send({ t: 'hello', name: myName });
        show('screen-lobby');
        renderLobby();
      })
      .catch(function (err) { toast(err.message); });
  });

  /* ---- audience (online): no card — watch the stage, vote, react ---- */
  $('btn-join-audience').addEventListener('click', function () {
    if (!requireName()) return;
    var code = Core.normalizeRoomCode($('join-code').value);
    if (code.length !== 4) { toast('Enter the 4-letter room code first.'); return; }
    toast('Joining the audience in room ' + code + '…');
    Net.createPeerGuest(code, { onMessage: guestOnMessage, onClose: guestDisconnected, onMedia: onNetMedia })
      .then(function (t) {
        role = 'guest'; mode = 'online'; transport = t; roomCode = code;
        G = { id: null, name: myName, card: null, marks: new Set([Core.CENTER]), state: null, deckName: '', winner: null, audience: true };
        t.send({ t: 'hello', name: myName, audience: true });
        show('screen-lobby');
        renderLobby();
      })
      .catch(function (err) { toast(err.message); });
  });

  /* ---- solo ---- */
  $('btn-solo').addEventListener('click', function () {
    if (!requireName()) return;
    enterHost('solo', Net.createLoopbackHost(), '');
  });

  /* ---- hotspot host ---- */
  var currentPairingId = null;
  var stopPairScan = null;
  $('btn-host-hotspot').addEventListener('click', function () {
    if (!requireName()) return;
    var t = Net.createHotspotHost({ onMessage: hostOnMessage, onJoin: hostOnJoin, onLeave: hostOnLeave, onRemoteTrack: onHsTrack });
    enterHost('hotspot', t, '');
    toast('Hotspot room open — pair each player below.');
  });
  $('btn-make-invite').addEventListener('click', function () {
    if (!transport || mode !== 'hotspot') return;
    $('pair-status').textContent = 'Making an invite…';
    transport.makeOffer().then(function (offer) {
      currentPairingId = offer.pairingId;
      $('invite-code').value = offer.code;
      var ok = Net.renderQR($('invite-qr'), offer.code);
      $('pair-status').textContent = ok
        ? 'Invite ready — the player scans this QR (or copies the code text). Then paste their reply code below.'
        : 'Invite ready — this code is long, so use the copy/paste text instead of the QR.';
    }).catch(function (err) { $('pair-status').textContent = err.message; });
  });
  $('btn-apply-answer').addEventListener('click', function () {
    var codeText = $('answer-code').value.trim();
    if (!currentPairingId) { $('pair-status').textContent = 'Make an invite first.'; return; }
    if (!codeText) { $('pair-status').textContent = 'Paste the player\u2019s reply code first.'; return; }
    try {
      transport.acceptAnswer(currentPairingId, codeText)
        .then(function () {
          $('pair-status').textContent = 'Paired! The player will appear in the list below.';
          $('answer-code').value = '';
          currentPairingId = null;
        })
        .catch(function (err) { $('pair-status').textContent = 'Pairing failed: ' + err.message; });
    } catch (err) { $('pair-status').textContent = err.message; }
  });
  $('btn-scan-answer').addEventListener('click', function () {
    var video = $('pair-scan-video');
    if (stopPairScan) { stopPairScan(); stopPairScan = null; video.hidden = true; return; }
    video.hidden = false;
    stopPairScan = Net.startScanner(video, function (text) {
      $('answer-code').value = text;
      video.hidden = true;
      stopPairScan = null;
      $('pair-status').textContent = 'Reply code scanned — tap "Pair this player".';
    }, function (err) { $('pair-status').textContent = err.message; video.hidden = true; });
  });

  /* ---- hotspot guest ---- */
  var guestHotspotTransport = null;
  var hsHelloTimer = null; // hoisted: re-pairing / leaving must be able to kill a pending hello loop
  var stopGuestScan = null;
  $('btn-join-hotspot').addEventListener('click', function () {
    if (!requireName()) return;
    show('screen-join-hotspot');
  });
  $('btn-joinhs-back').addEventListener('click', function () { show('screen-home'); });
  $('btn-guest-scan-offer').addEventListener('click', function () {
    var video = $('guest-scan-video');
    if (stopGuestScan) { stopGuestScan(); stopGuestScan = null; video.hidden = true; return; }
    video.hidden = false;
    stopGuestScan = Net.startScanner(video, function (text) {
      $('guest-offer-code').value = text;
      video.hidden = true;
      stopGuestScan = null;
      $('joinhs-status').textContent = 'Invite scanned — tap "Make my reply code".';
    }, function (err) { $('joinhs-status').textContent = err.message; video.hidden = true; });
  });
  $('btn-guest-make-reply').addEventListener('click', function () {
    var codeText = $('guest-offer-code').value.trim();
    if (!codeText) { $('joinhs-status').textContent = 'Paste or scan the host\u2019s invite code first.'; return; }
    if (hsHelloTimer) { clearInterval(hsHelloTimer); hsHelloTimer = null; } // a previous pairing attempt's hello loop dies here
    if (guestHotspotTransport) { try { guestHotspotTransport.close(); } catch (e) {} }
    guestHotspotTransport = Net.createHotspotGuest({
      onMessage: function (msg) {
        if (role !== 'guest') {
          role = 'guest'; mode = 'hotspot'; transport = guestHotspotTransport; roomCode = '';
          G = { id: null, name: myName, card: null, marks: new Set([Core.CENTER]), state: null, deckName: '', winner: null };
          show('screen-lobby');
          renderLobby();
        }
        guestOnMessage(msg);
      },
      onClose: function () { if (role === 'guest') guestDisconnected(); },
      onRemoteStream: onHsStream
    });
    guestHotspotTransport.acceptOffer(codeText)
      .then(function (answer) {
        $('guest-answer-code').value = answer;
        var ok = Net.renderQR($('guest-answer-qr'), answer);
        $('guest-answer-wrap').hidden = false;
        $('joinhs-status').textContent = ok
          ? 'Reply ready — show the QR to the host (or copy the text).'
          : 'Reply ready — this code is long, so give the host the text version.';
        // The host sends 'welcome' the moment the channel opens; our
        // hello must be ready to go out as soon as it can.
        var tries = 0;
        hsHelloTimer = setInterval(function () {
          tries++;
          try { guestHotspotTransport.send({ t: 'hello', name: myName }); } catch (e) {}
          if (role === 'guest' || tries > 40) { clearInterval(hsHelloTimer); hsHelloTimer = null; }
        }, 500);
      })
      .catch(function (err) { $('joinhs-status').textContent = err.message; });
  });

  /* ---- lobby / game controls ---- */
  // The Start tap is the strongest gesture in the app: create the
  // track player right here so it exists and is READY before the first
  // Call — the first song's load then goes out inside the Call tap
  // itself instead of from an async onReady callback.
  $('btn-start-game').addEventListener('click', function () { ensureTrackPlayer(); if (H) hostStartGame(); });
  $('btn-leave-lobby').addEventListener('click', function () { leaveRoom(false); });
  $('btn-leave-game').addEventListener('click', function () { leaveRoom(false); });
  $('btn-call-next').addEventListener('click', function () { hostCallNext(); });
  $('btn-end-round').addEventListener('click', function () { hostEndRound(); });
  $('chk-auto').addEventListener('change', function (e) {
    if (!H) return;
    H.auto = e.target.checked;
    if (H.auto && H.phase === 'playing' && H.called.length === 0) hostCallNext();
    toast(H.auto ? 'Auto-call on — a song every minute.' : 'Auto-call off — you run the caller.');
  });
  setInterval(function () { // auto-call driver (host only)
    if (H && H.auto && H.phase === 'playing' && H.lastCallAt && Date.now() - H.lastCallAt >= CALL_SECONDS * 1000) {
      hostCallNext();
    }
  }, 500);

  $('btn-bingo').addEventListener('click', function () {
    $('bingo-status').textContent = '';
    if (role === 'host') {
      hostHandleClaim(selfPlayer());
    } else if (role === 'guest' && G) {
      var round = G.state ? G.state.round : 1;
      // Pre-check against the HOST'S picked pattern for this round,
      // not just the default ladder: under a picked shape (X, Frame…)
      // the old ladder-only check told real winners "No BINGO yet"
      // and never sent the claim the host would have verified.
      if (!Core.checkWin(Array.from(G.marks), round, activePatternId())) {
        $('bingo-status').textContent = 'No BINGO on your card yet — keep marking!';
        return;
      }
      $('bingo-status').textContent = 'Claim sent — the host is checking your card…';
      transport.send({ t: 'bingo' });
    }
  });

  $('btn-home-game').addEventListener('click', function () { leaveRoom(false); });

  /* ---- stage controls ---- */
  $('btn-end-performance').addEventListener('click', function () { endPerformance(); });
  $('btn-end-vote').addEventListener('click', function () { closeVote(); });
  $('btn-stage-continue').addEventListener('click', function () { resumeGame(); });
  // Delegated: battle pick-buttons are built fresh for every battle.
  $('vote-panel').addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('.vote-btn') : null;
    if (!b || b.disabled) return;
    sfx('vote');
    var vote = b.dataset.vote;
    document.querySelectorAll('.vote-btn').forEach(function (x) {
      x.classList.toggle('picked', x === b);
      x.disabled = true;
    });
    if (role === 'host') hostHandleVote(selfPlayer(), vote);
    else if (transport) transport.send({ t: 'vote', vote: vote });
  });
  $('btn-go-live').addEventListener('click', function () {
    var slot = stageNow.findIndex(function (x) { return x.id === myId(); });
    if (slot !== -1) startMyPerformance(slot);
  });
  $('btn-play-track').addEventListener('click', function () {
    tapPlayTrack(); // a real tap always beats autoplay rules
  });
  $('btn-play-call').addEventListener('click', function () {
    trackPurpose = 'call';
    tapPlayTrack();
  });
  $('btn-claim-mic').addEventListener('click', function () {
    if (role === 'host') hostHandleClaimMic(selfPlayer());
    else if (transport) {
      transport.send({ t: 'claim' });
      if (G) G.claims = (G.claims || []).concat([myId()]); // optimistic — host confirms
      paintClaimButtons();
    }
  });
  $('btn-pass-mic').addEventListener('click', function () {
    if (role === 'host') hostHandlePassMic(selfPlayer());
    else if (transport) {
      transport.send({ t: 'pass' });
      if (G) G.passedClaim = true;
      paintClaimButtons();
    }
  });
  $('btn-decline').addEventListener('click', function () {
    stopStageMedia();
    if (role === 'host') hostHandleDecline(selfPlayer());
    else if (transport) transport.send({ t: 'decline' });
  });

  /* ---- reactions, called-songs history, sound toggle ---- */
  document.querySelectorAll('.react-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      var emoji = b.dataset.react;
      if (role === 'host' && H) {
        broadcast({ t: 'react', emoji: emoji, name: myName });
        floater(emoji, myName);
      } else if (role === 'guest' && transport) {
        transport.send({ t: 'react', emoji: emoji, name: myName });
        floater(emoji, myName);
      } else {
        floater(emoji, myName); // not in a room yet — just for you
      }
    });
  });
  $('btn-history').addEventListener('click', function () {
    var p = $('history-panel');
    p.hidden = !p.hidden;
    if (!p.hidden) renderHistory(myView().called);
  });
  var soundBtn = $('btn-sound');
  function paintSoundBtn() { if (soundBtn) soundBtn.textContent = sfxOn ? '🔊' : '🔇'; }
  paintSoundBtn();
  if (soundBtn) soundBtn.addEventListener('click', function () {
    sfxOn = !sfxOn;
    localStorage.setItem('lsb_sound', sfxOn ? '1' : '0');
    paintSoundBtn();
    if (sfxOn) sfx('vote');
    toast(sfxOn ? 'Sound on.' : 'Sound off.');
  });

  /* ---- scores controls ---- */
  $('btn-next-round').addEventListener('click', function () { hostNextRound(); });
  $('btn-new-game').addEventListener('click', function () { hostNewGame(); });
  $('btn-rematch').addEventListener('click', function () { hostRematch(); });
  $('btn-share-scores').addEventListener('click', function () {
    var rec = currentNightRecord();
    if (rec) shareStandingsImage(rec);
  });
  $('btn-scores-home').addEventListener('click', function () { leaveRoom(false); });

  /* ---- past nights ---- */
  $('btn-past-nights').addEventListener('click', function () { show('screen-nights'); renderNights(); });
  $('btn-nights-home').addEventListener('click', function () { show('screen-home'); });
  $('btn-night-back').addEventListener('click', function () { renderNights(); });
  $('btn-night-delete').addEventListener('click', function () { deleteOpenNight(); });
  $('btn-night-share').addEventListener('click', function () {
    var n = nightById(openNightId);
    if (n) shareStandingsImage(n);
  });
  $('btn-night-rematch').addEventListener('click', function () { rematchNight(); });

  /* ================= DECK BUILDER ================= */
  var builderPicked = new Set();
  function renderBuilderList() {
    var q = $('builder-search').value.trim().toLowerCase();
    var list = $('builder-list');
    list.innerHTML = '';
    Data.SONGS.forEach(function (s) {
      if (q && (s.artist + ' ' + s.title).toLowerCase().indexOf(q) === -1) return;
      var row = document.createElement('label');
      row.className = 'builder-item';
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = builderPicked.has(s.id);
      cb.addEventListener('change', function () {
        if (cb.checked) builderPicked.add(s.id); else builderPicked.delete(s.id);
        updateBuilderCount();
      });
      row.appendChild(cb);
      var txt = document.createElement('span');
      txt.innerHTML = '<b>' + esc(s.artist) + '</b> <span class="b-title">' + esc(s.title) + '</span>';
      row.appendChild(txt);
      list.appendChild(row);
    });
    updateBuilderCount();
  }
  function updateBuilderCount() {
    $('builder-count').textContent = builderPicked.size + ' songs picked' +
      (builderPicked.size >= 24 ? ' — ready to save!' : ' — a deck needs at least 24.');
    $('btn-builder-save').disabled = builderPicked.size < 24;
  }
  function renderCustomDeckList() {
    var wrap = $('custom-deck-list');
    wrap.innerHTML = '';
    var decks = customDecks();
    if (!decks.length) { wrap.innerHTML = '<p class="hint">No custom decks yet.</p>'; return; }
    decks.forEach(function (d) {
      var row = document.createElement('div');
      row.className = 'custom-deck-row';
      row.innerHTML = '<span><b>' + esc(d.name) + '</b> — ' + d.songs.length + ' songs</span>';
      var del = document.createElement('button');
      del.className = 'btn small danger';
      del.textContent = 'Delete';
      del.addEventListener('click', function () {
        saveCustomDecks(customDecks().filter(function (x) { return x.id !== d.id; }));
        if (selectedDeckId === d.id) { selectedDeckId = 'after-spot-starter'; localStorage.setItem('lsb_deck', selectedDeckId); }
        renderCustomDeckList();
        renderDeckGrid();
      });
      row.appendChild(del);
      wrap.appendChild(row);
    });
  }
  $('btn-builder').addEventListener('click', function () {
    show('screen-builder');
    renderBuilderList();
    renderCustomDeckList();
  });
  $('btn-builder-back').addEventListener('click', function () { show('screen-home'); });
  $('builder-search').addEventListener('input', renderBuilderList);
  $('btn-builder-save').addEventListener('click', function () {
    var name = $('builder-name').value.trim();
    if (!name) { toast('Give your deck a name first.'); return; }
    if (builderPicked.size < 24) { toast('A deck needs at least 24 songs.'); return; }
    var decks = customDecks();
    decks.push({
      id: 'custom-' + Date.now().toString(36),
      name: name, tagline: 'Custom deck by ' + (myName || 'you'),
      songs: Array.from(builderPicked), custom: true
    });
    saveCustomDecks(decks);
    builderPicked = new Set();
    $('builder-name').value = '';
    renderBuilderList();
    renderCustomDeckList();
    renderDeckGrid();
    toast('Deck "' + name + '" saved — pick it on the home screen!');
  });

  /* ================= INIT ================= */
  $('player-name').value = myName;
  $('player-name').addEventListener('change', function () {
    myName = $('player-name').value.trim();
    localStorage.setItem('lsb_name', myName);
  });
  // Warm the YouTube API script at startup (script load only — no
  // player, no video): by the time anyone taps Start or Call, the API
  // is on the page and the player can be constructed synchronously
  // inside that tap (see ensureTrackPlayer).
  ytApi();
  renderDeckGrid();
  paintPastNightsBtn();
})();

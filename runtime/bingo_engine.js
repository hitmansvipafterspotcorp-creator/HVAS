'use strict';
const BingoEngine = (() => {
  const SONG_POOL = [
    'Drake - Hotline Bling', 'Beyoncé - Cuff It', 'SZA - Kill Bill',
    'Kendrick - HUMBLE.', 'Bad Bunny - Tití', 'Doja Cat - Say So',
    'Tyler - EARFQUAKE', 'Cardi B - WAP', 'Lil Baby - Drip Too Hard',
    'Future - Mask Off', 'Gunna - Pushin P', 'Young Thug - Tick Tock',
    'Lil Uzi - XO Tour', 'Travis Scott - SICKO MODE', 'Post Malone - Rockstar',
    'Meg Thee Stallion - Savage', 'City Girls - Act Up', 'DaBaby - ROCKSTAR',
    'Roddy Ricch - The Box', 'Jack Harlow - WHATS POPPIN', 'Polo G - Pop Out',
    'NLE Choppa - Shotta Flow', 'Moneybagg Yo - Said Sum', 'Big Sean - One Man',
    'Chance the Rapper - No Problem', 'Wale - The Need To Know', 'J. Cole - No Role Modelz',
    'Bryson Tiller - Exchange', 'Brent Faiyaz - Gravity', 'Summer Walker - Playing Games',
    'Lucky Daye - Roll Some Mo', 'H.E.R. - Focus', 'Jhené Aiko - None of Your Concern',
    'Anderson Paak - Come Down', 'Smino - Slow Down', 'Sza - Good Days',
    'Giveon - Heartbreak Anniversary', 'Doja Cat - Need to Know', 'Silk Sonic - Leave the Door Open'
  ];

  let state = {
    view: 'player-card',     // 'player-card'|'host-control'|'verify'|'history'|'winner'|'party-mode'
    playerCount: 0,
    minPlayers: 5,
    isHost: false,
    cards: {},               // cardId -> 5x5 grid
    markedCells: {},         // cardId -> Set of 'r,c' strings
    callHistory: [],
    currentRound: 1,
    roundWinners: { 1: null, 2: null, 3: null },
    gameActive: false,
    partyMode: false,
    pendingVerify: null
  };

  function generateCard(seed) {
    const shuffled = [...SONG_POOL].sort(() => hashRand(seed + Math.random()) - 0.5);
    const grid = [];
    let idx = 0;
    for (let r = 0; r < 5; r++) {
      grid[r] = [];
      for (let c = 0; c < 5; c++) {
        if (r === 2 && c === 2) { grid[r][c] = 'FREE SPACE'; }
        else { grid[r][c] = shuffled[idx++] || '?'; }
      }
    }
    return grid;
  }

  function hashRand(n) { return (Math.sin(n) * 43758.5453) % 1; }

  function createSession(hostMode = false) {
    state.isHost = hostMode;
    state.gameActive = false;
    state.callHistory = [];
    state.currentRound = 1;
    state.roundWinners = { 1: null, 2: null, 3: null };
    state.cards = {};
    state.markedCells = {};
  }

  function joinAsPlayer(name) {
    const cardId = `card_${name}_${Date.now()}`;
    const seed = Date.now() + name.length * 31;
    state.cards[cardId] = generateCard(seed);
    state.markedCells[cardId] = new Set(['2,2']); // FREE SPACE
    state.playerCount++;
    return cardId;
  }

  function startGame() {
    if (state.playerCount >= state.minPlayers || state.partyMode) {
      state.gameActive = true;
      return true;
    }
    return false;
  }

  function enablePartyMode() {
    state.partyMode = true;
    state.minPlayers = 2;
  }

  function hostCallSong() {
    if (!state.gameActive) return null;
    const remaining = SONG_POOL.filter(s => !state.callHistory.includes(s));
    if (remaining.length === 0) return null;
    const song = remaining[Math.floor(Math.random() * remaining.length)];
    state.callHistory.push(song);
    return song;
  }

  function markCell(cardId, row, col) {
    if (!state.markedCells[cardId]) state.markedCells[cardId] = new Set(['2,2']);
    state.markedCells[cardId].add(`${row},${col}`);
  }

  function checkWin(cardId, round) {
    const marked = state.markedCells[cardId];
    if (!marked) return false;

    const isMarked = (r, c) => marked.has(`${r},${c}`);

    if (round === 1) {
      // Any single line
      for (let i = 0; i < 5; i++) {
        if ([0,1,2,3,4].every(j => isMarked(i, j))) return true; // row
        if ([0,1,2,3,4].every(j => isMarked(j, i))) return true; // col
      }
      if ([0,1,2,3,4].every(i => isMarked(i, i))) return true;      // diag
      if ([0,1,2,3,4].every(i => isMarked(i, 4-i))) return true;    // diag
      return false;
    }
    if (round === 2) {
      // Two lines
      let lineCount = 0;
      for (let i = 0; i < 5; i++) {
        if ([0,1,2,3,4].every(j => isMarked(i, j))) lineCount++;
        if ([0,1,2,3,4].every(j => isMarked(j, i))) lineCount++;
      }
      if ([0,1,2,3,4].every(i => isMarked(i, i))) lineCount++;
      if ([0,1,2,3,4].every(i => isMarked(i, 4-i))) lineCount++;
      return lineCount >= 2;
    }
    if (round === 3) {
      // Full card (all 25 cells including free space)
      for (let r = 0; r < 5; r++)
        for (let c = 0; c < 5; c++)
          if (!isMarked(r, c)) return false;
      return true;
    }
    return false;
  }

  function verifyCard(cardId) {
    return !!state.cards[cardId];
  }

  function getSongHistory() { return [...state.callHistory]; }
  function getState() { return state; }
  function setView(v) { state.view = v; }
  function getView() { return state.view; }
  function getCard(cardId) { return state.cards[cardId]; }
  function getMarked(cardId) { return state.markedCells[cardId] || new Set(['2,2']); }
  function getRound() { return state.currentRound; }
  function advanceRound() { state.currentRound = Math.min(3, state.currentRound + 1); }

  function renderCardHTML(cardId) {
    const grid = state.cards[cardId];
    const marked = state.markedCells[cardId] || new Set(['2,2']);
    if (!grid) return '<p style="color:#ff00aa">No card found.</p>';

    const header = ['B', 'I', 'N', 'G', 'O'];
    let html = '<table class="bingo-table">';
    html += '<tr>' + header.map(h => `<th>${h}</th>`).join('') + '</tr>';
    for (let r = 0; r < 5; r++) {
      html += '<tr>';
      for (let c = 0; c < 5; c++) {
        const isMarked = marked.has(`${r},${c}`);
        const isFree = r === 2 && c === 2;
        const cls = isFree ? 'bingo-cell free' : (isMarked ? 'bingo-cell marked' : 'bingo-cell');
        const text = isFree ? '⭐<br>FREE' : grid[r][c];
        const onclick = `BingoEngine._markCell('${cardId}',${r},${c})`;
        html += `<td class="${cls}" onclick="${onclick}" data-r="${r}" data-c="${c}">${text}</td>`;
      }
      html += '</tr>';
    }
    html += '</table>';
    return html;
  }

  // Exposed for onclick
  function _markCell(cardId, r, c) {
    markCell(cardId, r, c);
    // Re-render card UI
    const el = document.getElementById('bingo-card-area');
    if (el) el.innerHTML = renderCardHTML(cardId);
  }

  return {
    SONG_POOL, state, generateCard, createSession, joinAsPlayer,
    startGame, enablePartyMode, hostCallSong, markCell,
    checkWin, verifyCard, getSongHistory, getState, setView, getView,
    getCard, getMarked, getRound, advanceRound, renderCardHTML, _markCell
  };
})();

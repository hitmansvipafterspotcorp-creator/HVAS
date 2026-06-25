'use strict';
/**
 * DanceMinigame — rhythm arrow game played on the dance floor.
 * Controls: ←↑↓→ keys or on-screen touch buttons.
 * Win by scoring 70%+ perfect/good hits within 30 beats.
 */
const DanceMinigame = (() => {
  const DIRS      = ['left', 'down', 'up', 'right'];
  const DIR_KEYS  = { ArrowLeft:'left', ArrowDown:'down', ArrowUp:'up', ArrowRight:'right',
                      a:'left', s:'down', w:'up', d:'right' };
  const COLORS    = { left:'#ff00aa', down:'#00ffcc', up:'#ffee00', right:'#aa44ff' };
  const LANE_X    = { left:0.2, down:0.4, up:0.6, right:0.8 };

  const BPM       = 128;
  const BEAT_MS   = 60000 / BPM;
  const TOTAL_BEATS = 32;
  const ARROW_SPAWN_Y = -60;     // spawn above canvas
  const TARGET_Y_FRAC = 0.78;   // where target zone sits
  const HIT_WINDOW_PX = 44;
  const PERFECT_PX    = 18;

  let cv, ctx, W, H;
  let _raf = null;
  let _running = false;
  let _startTime = 0;
  let _arrows = [];      // { dir, spawnTime, y, hit, miss }
  let _score = { perfect:0, good:0, miss:0 };
  let _beats = 0;
  let _lastBeat = -1;
  let _charId = 'creator';
  let _dancerT = 0;
  let _lastTick = 0;
  let _flashHits = [];  // { dir, t, label } for hit feedback
  let _onClose = null;
  let _bgImg = null;

  function _loadBg(src) {
    if (!src) return;
    _bgImg = new Image();
    _bgImg.src = src;
  }

  function open(charId, bgSrc, onClose) {
    _charId = charId || 'creator';
    _onClose = onClose || null;
    _score = { perfect:0, good:0, miss:0 };
    _arrows = [];
    _beats = 0;
    _lastBeat = -1;
    _flashHits = [];
    _dancerT = 0;

    cv = document.getElementById('dance-canvas');
    if (!cv) return;
    ctx = cv.getContext('2d');

    const overlay = document.getElementById('dance-minigame');
    const result  = document.getElementById('dance-result');
    overlay.style.display = 'flex';
    result.style.display  = 'none';

    // Fit canvas
    cv.width  = Math.min(window.innerWidth, 600);
    cv.height = Math.round(cv.width * 1.2);
    W = cv.width; H = cv.height;

    _loadBg(bgSrc || 'assets/venues/tally_13rave.png');

    _running = true;
    _startTime = performance.now();
    _lastTick  = _startTime;

    document.addEventListener('keydown', _onKey);
    _raf = requestAnimationFrame(_tick);
  }

  function close() {
    _running = false;
    cancelAnimationFrame(_raf);
    _raf = null;
    document.removeEventListener('keydown', _onKey);
    const overlay = document.getElementById('dance-minigame');
    if (overlay) overlay.style.display = 'none';
    if (_onClose) _onClose(_getResult());
  }

  function _getResult() {
    const total = _score.perfect + _score.good + _score.miss;
    const pct   = total ? Math.round((_score.perfect * 1 + _score.good * 0.5) / total * 100) : 0;
    return { score: _score, pct, win: pct >= 60 };
  }

  function _onKey(e) {
    const dir = DIR_KEYS[e.key];
    if (dir) { e.preventDefault(); _hitDir(dir); }
    if (e.key === 'Escape') close();
  }

  // Called by touch controls wired in quest_engine
  function hitDir(dir) { if (_running) _hitDir(dir); }

  function _hitDir(dir) {
    // Find the closest unhit arrow in this lane
    const targetY = H * TARGET_Y_FRAC;
    let best = null, bestDist = Infinity;
    for (const a of _arrows) {
      if (a.dir !== dir || a.hit || a.miss) continue;
      const dist = Math.abs(a.y - targetY);
      if (dist < bestDist) { bestDist = dist; best = a; }
    }
    if (best && bestDist < HIT_WINDOW_PX) {
      best.hit = true;
      const label = bestDist < PERFECT_PX ? 'PERFECT' : 'GOOD';
      if (label === 'PERFECT') _score.perfect++;
      else _score.good++;
      _flashHits.push({ dir, t: 0, label });
    } else {
      _flashHits.push({ dir, t: 0, label: 'MISS' });
      _score.miss++;
    }
  }

  function _spawnBeat(beatNum) {
    // Pattern: semi-random but always 4 arrows per bar of 4 beats
    const beat = beatNum % 4;
    const seqSets = [
      ['left','right','up','down'],
      ['up','down','left','right'],
      ['right','up','left','down'],
      ['down','left','right','up'],
    ];
    const seq = seqSets[Math.floor(beatNum / 4) % seqSets.length];
    _arrows.push({ dir: seq[beat], y: ARROW_SPAWN_Y, spawnBeat: beatNum, hit: false, miss: false });
  }

  function _tick(now) {
    if (!_running) return;
    const dt = (now - _lastTick) / 1000;
    _lastTick = now;
    _dancerT += dt;

    const elapsed = now - _startTime;
    const beatNum = Math.floor(elapsed / BEAT_MS);

    // Spawn arrows on new beats
    if (beatNum !== _lastBeat && beatNum < TOTAL_BEATS) {
      _lastBeat = beatNum;
      _beats = beatNum;
      _spawnBeat(beatNum);
    }

    // Move arrows down
    const speed = H / (BEAT_MS * 3 / 1000); // travel 3 beats worth in height
    for (const a of _arrows) {
      if (!a.hit) a.y += speed * dt;
    }

    // Miss arrows that passed target
    const targetY = H * TARGET_Y_FRAC;
    for (const a of _arrows) {
      if (!a.hit && !a.miss && a.y > targetY + HIT_WINDOW_PX) {
        a.miss = true;
        _score.miss++;
        _flashHits.push({ dir: a.dir, t: 0, label: 'MISS' });
      }
    }

    // Advance flash timers
    for (const f of _flashHits) f.t += dt;
    _flashHits = _flashHits.filter(f => f.t < 0.5);

    _draw(elapsed, beatNum);

    // End condition
    if (beatNum >= TOTAL_BEATS && _arrows.every(a => a.hit || a.miss)) {
      _showResult();
      return;
    }

    _raf = requestAnimationFrame(_tick);
  }

  function _draw(elapsed, beatNum) {
    ctx.clearRect(0, 0, W, H);

    // Background
    if (_bgImg && _bgImg.complete && _bgImg.naturalWidth) {
      ctx.globalAlpha = 0.45;
      ctx.drawImage(_bgImg, 0, 0, W, H);
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = '#0a001a';
      ctx.fillRect(0, 0, W, H);
    }

    // Beat pulse overlay
    const beatFrac = (elapsed % BEAT_MS) / BEAT_MS;
    const pulse = Math.max(0, 1 - beatFrac * 3);
    if (pulse > 0) {
      ctx.fillStyle = `rgba(255,0,170,${pulse * 0.08})`;
      ctx.fillRect(0, 0, W, H);
    }

    // Lane guides
    DIRS.forEach(dir => {
      const x = LANE_X[dir] * W;
      ctx.strokeStyle = `rgba(255,255,255,0.08)`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    });

    // Target zone circles
    const targetY = H * TARGET_Y_FRAC;
    DIRS.forEach(dir => {
      const x = LANE_X[dir] * W;
      const col = COLORS[dir];
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, targetY, 26, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    });

    // Arrows
    for (const a of _arrows) {
      if (a.hit) continue;
      const x = LANE_X[a.dir] * W;
      _drawArrow(ctx, a.dir, x, a.y, a.miss ? 0.25 : 1);
    }

    // Hit flash text
    for (const f of _flashHits) {
      const x = LANE_X[f.dir] * W;
      const alpha = Math.max(0, 1 - f.t / 0.5);
      const y = targetY - 50 * f.t / 0.5;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `bold ${f.label === 'PERFECT' ? 18 : 14}px Orbitron, sans-serif`;
      ctx.fillStyle = f.label === 'PERFECT' ? '#ffee00' : f.label === 'GOOD' ? '#00ffcc' : '#ff4444';
      ctx.textAlign = 'center';
      ctx.fillText(f.label, x, y);
      ctx.restore();
    }

    // Dancer sprite (bottom-center)
    const dancerW = Math.round(W * 0.28);
    const dancerH = Math.round(dancerW * 1.3);
    const dx = W * 0.5 - dancerW * 0.5;
    const dy = H - dancerH - 10;
    const animName = _dancerT % 0.5 < 0.25 ? 'idle' : 'walk';  // bob effect
    let drawn = false;
    if (typeof SpriteSystem !== 'undefined') {
      drawn = SpriteSystem.drawAnim(ctx, _charId, 'idle', _dancerT, dx, dy, dancerW, dancerH, { facing: 1 });
    }
    if (!drawn && typeof CharRenderer !== 'undefined') {
      CharRenderer.draw(ctx, _charId, 'idle', _dancerT, dx + dancerW * 0.5, dy + dancerH, dancerW * 0.8, dancerH, 1, {});
    }

    // HUD
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, 48);
    ctx.font = 'bold 13px Orbitron, sans-serif';
    ctx.fillStyle = '#ffee00';
    ctx.textAlign = 'left';
    ctx.fillText(`PERFECT: ${_score.perfect}`, 12, 20);
    ctx.fillStyle = '#00ffcc';
    ctx.fillText(`GOOD: ${_score.good}`, 12, 38);
    ctx.fillStyle = '#ff4444';
    ctx.textAlign = 'center';
    ctx.fillText(`MISS: ${_score.miss}`, W * 0.5, 20);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'right';
    ctx.fillText(`BEAT ${Math.min(beatNum + 1, TOTAL_BEATS)} / ${TOTAL_BEATS}`, W - 12, 20);
    const pct = _calcPct();
    ctx.fillStyle = pct >= 60 ? '#00ffcc' : '#ff4444';
    ctx.fillText(`${pct}%`, W - 12, 38);
    ctx.restore();

    // Instruction strip
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, H - 34, W, 34);
    ctx.font = '11px Rajdhani, sans-serif';
    ctx.fillStyle = '#aaa';
    ctx.textAlign = 'center';
    ctx.fillText('← ↓ ↑ →  or  A S W D   |  ESC to exit', W * 0.5, H - 14);
    ctx.restore();
  }

  function _drawArrow(ctx, dir, x, y, alpha) {
    const col = COLORS[dir];
    const s = 22;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = col;
    ctx.shadowColor = col;
    ctx.shadowBlur = 12;
    ctx.translate(x, y);
    const rot = { left: Math.PI, right: 0, up: -Math.PI / 2, down: Math.PI / 2 };
    ctx.rotate(rot[dir] || 0);
    ctx.beginPath();
    ctx.moveTo(s, 0);
    ctx.lineTo(-s * 0.6, -s * 0.7);
    ctx.lineTo(-s * 0.2, 0);
    ctx.lineTo(-s * 0.6, s * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function _calcPct() {
    const total = _score.perfect + _score.good + _score.miss;
    if (!total) return 0;
    return Math.round((_score.perfect + _score.good * 0.5) / total * 100);
  }

  function _showResult() {
    _running = false;
    cancelAnimationFrame(_raf);
    _raf = null;
    document.removeEventListener('keydown', _onKey);

    const pct = _calcPct();
    const win = pct >= 60;
    const titleEl = document.getElementById('dance-result-title');
    const scoreEl = document.getElementById('dance-result-score');
    const result  = document.getElementById('dance-result');

    if (titleEl) {
      titleEl.textContent = win ? '🔥 FIRE ON THE FLOOR!' : 'BETTER LUCK NEXT TIME';
      titleEl.style.color = win ? '#ffee00' : '#ff4444';
    }
    if (scoreEl) {
      scoreEl.innerHTML = `PERFECT: ${_score.perfect} &nbsp;|&nbsp; GOOD: ${_score.good} &nbsp;|&nbsp; MISS: ${_score.miss}<br>SCORE: ${pct}%`;
    }
    if (result) result.style.display = 'flex';

    if (_onClose && win) {
      // Award status points
      if (typeof SaveSystem !== 'undefined') {
        const save = SaveSystem.load() || SaveSystem.defaults();
        save.statusPts = (save.statusPts || 0) + 150;
        SaveSystem.patch({ statusPts: save.statusPts });
      }
    }
  }

  return { open, close, hitDir };
})();
window.DanceMinigame = DanceMinigame;

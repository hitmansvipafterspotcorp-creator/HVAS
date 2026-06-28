'use strict';
// ── HITGEAR OS — CANVAS CHARACTER RENDERER ───────────────────────────────────
// Draws all fighters as fully-animated Canvas humanoids.
// No sprite sheets required — all art is procedural, per character.
//
// API:
//   CharRenderer.draw(ctx, charId, state, t, x, groundY, charH, facing, opts)
//   CharRenderer.spawnHitSpark(x, y, level, color)
//   CharRenderer.spawnSpecialVFX(type, x, y, color, facing)
//   CharRenderer.superFlash(duration)
//   CharRenderer.updateVFX(dt)
//   CharRenderer.drawVFX(ctx, W, H)
// ─────────────────────────────────────────────────────────────────────────────

const CharRenderer = (() => {

  // ── PER-CHARACTER VISUAL CONFIG ─────────────────────────────────────────────
  // col1=body primary  col2=body secondary  skin=face/hands  glow=shadow color
  // bulk: 1=normal, >1=wider  height: 1=normal, <1=shorter
  // accessory: string key
  const CFG = {
    1:  { col1:'#ff00aa', col2:'#880066', skin:'#c68642', glow:'#ff44cc', bulk:1.00, height:1.00, acc:'mic' },
    2:  { col1:'#aa44ff', col2:'#6622aa', skin:'#7a5c3c', glow:'#cc88ff', bulk:1.08, height:1.00, acc:'headphones' },
    3:  { col1:'#ff8800', col2:'#aa5500', skin:'#c68642', glow:'#ffaa44', bulk:0.88, height:0.96, acc:'flames' },
    4:  { col1:'#ffdd00', col2:'#aa9900', skin:'#8B6914', glow:'#ffee66', bulk:0.92, height:0.98, acc:'bolt' },
    5:  { col1:'#ff44cc', col2:'#aa0088', skin:'#f4c5a0', glow:'#ff88ee', bulk:0.82, height:1.02, acc:'camera_flash' },
    6:  { col1:'#44aaff', col2:'#1166aa', skin:'#c0a080', glow:'#88ccff', bulk:0.85, height:0.99, acc:'camera' },
    7:  { col1:'#ff6600', col2:'#aa3300', skin:'#a0602a', glow:'#ff8844', bulk:0.95, height:1.01, acc:'confetti' },
    8:  { col1:'#ff00ff', col2:'#880088', skin:'#f4c5a0', glow:'#ff66ff', bulk:0.78, height:1.04, acc:'none' },
    9:  { col1:'#88aa44', col2:'#556622', skin:'#8B6914', glow:'#aacc66', bulk:0.90, height:0.97, acc:'bag' },
    10: { col1:'#444466', col2:'#222233', skin:'#5a5a7a', glow:'#8888cc', bulk:1.30, height:1.00, acc:'shield' },
    11: { col1:'#ffaa44', col2:'#aa6600', skin:'#c68642', glow:'#ffcc88', bulk:1.00, height:1.02, acc:'mic' },
    12: { col1:'#cc4400', col2:'#882200', skin:'#8B4513', glow:'#ff6622', bulk:1.10, height:1.00, acc:'football' },
    13: { col1:'#bb8800', col2:'#775500', skin:'#c08030', glow:'#ddaa33', bulk:0.90, height:1.00, acc:'scroll' },
    14: { col1:'#cc2222', col2:'#7a0f0f', skin:'#5a3825', glow:'#ff5555', bulk:1.02, height:1.01, acc:'mic' },
    20: { col1:'#2288cc', col2:'#114466', skin:'#5a3825', glow:'#66bbff', bulk:1.05, height:1.02, acc:'none' },
    21: { col1:'#33aa55', col2:'#1a5530', skin:'#6b4423', glow:'#66dd88', bulk:1.18, height:1.03, acc:'none' },
    22: { col1:'#ddaa22', col2:'#886600', skin:'#6b4423', glow:'#ffcc55', bulk:1.00, height:1.00, acc:'none' },
    30: { col1:'#9933cc', col2:'#551a77', skin:'#c68642', glow:'#cc77ee', bulk:0.95, height:1.00, acc:'none' },
    31: { col1:'#dddddd', col2:'#999999', skin:'#f4c5a0', glow:'#ffffff', bulk:0.92, height:0.99, acc:'none' },
  };

  // ── ANIMATION POSE KEYFRAMES ────────────────────────────────────────────────
  // Each pose: {
  //   lean   : torso tilt deg (+ = forward)
  //   squat  : 0..1 leg bend depth
  //   headT  : head tilt deg (+ = forward)
  //   lAs, lAe : left  arm shoulder/elbow angles (deg from down, + = forward)
  //   rAs, rAe : right arm shoulder/elbow angles
  //   lHip, lKnee : left  leg hip/knee angles (deg, + = fwd kick)
  //   rHip, rKnee : right leg
  // }
  const ANIM = {
    idle: [
      { lean:0,  squat:0.0, headT:0,  lAs:-20, lAe:30,  rAs:20,  rAe:-30, lHip:6,  lKnee:-8,  rHip:-6, rKnee:8  },
      { lean:1,  squat:0.04,headT:3,  lAs:-18, lAe:28,  rAs:18,  rAe:-28, lHip:5,  lKnee:-6,  rHip:-5, rKnee:6  },
      { lean:0,  squat:0.0, headT:0,  lAs:-20, lAe:30,  rAs:20,  rAe:-30, lHip:6,  lKnee:-8,  rHip:-6, rKnee:8  },
      { lean:-1, squat:0.04,headT:-3, lAs:-22, lAe:32,  rAs:22,  rAe:-32, lHip:7,  lKnee:-10, rHip:-7, rKnee:10 },
    ],
    walk: [
      { lean:8,  squat:0.1, headT:-4, lAs:-60, lAe:20,  rAs:50,  rAe:-15, lHip:42, lKnee:-50, rHip:-25,rKnee:10 },
      { lean:7,  squat:0.06,headT:-2, lAs:-30, lAe:15,  rAs:20,  rAe:-10, lHip:20, lKnee:-20, rHip:-10,rKnee:5  },
      { lean:8,  squat:0.1, headT:-4, lAs:50,  lAe:-15, rAs:-60, rAe:20,  lHip:-25,lKnee:10,  rHip:42, rKnee:-50},
      { lean:7,  squat:0.06,headT:-2, lAs:20,  lAe:-10, rAs:-30, rAe:15,  lHip:-10,rKnee:5,   rHip:20, lKnee:-20},
    ],
    crouch: [
      { lean:10, squat:0.55,headT:5,  lAs:-30, lAe:50,  rAs:30,  rAe:-50, lHip:30, lKnee:-90, rHip:-30,rKnee:90 },
    ],
    jump: [
      { lean:-5, squat:0.0, headT:-8, lAs:-70, lAe:60,  rAs:70,  rAe:-60, lHip:-30,lKnee:40,  rHip:30, rKnee:-40},
      { lean:-3, squat:0.0, headT:-5, lAs:-50, lAe:40,  rAs:50,  rAe:-40, lHip:-15,lKnee:20,  rHip:15, rKnee:-20},
    ],
    light: [
      { lean:0,  squat:0.1, headT:0,  lAs:-20, lAe:30,  rAs:20,  rAe:-30, lHip:6,  lKnee:-8,  rHip:-6, rKnee:8  },
      { lean:18, squat:0.2, headT:8,  lAs:-80, lAe:-10, rAs:20,  rAe:-30, lHip:15, lKnee:-10, rHip:-6, rKnee:8  },
      { lean:22, squat:0.18,headT:10, lAs:-95, lAe:5,   rAs:15,  rAe:-25, lHip:18, lKnee:-12, rHip:-8, rKnee:10 },
      { lean:5,  squat:0.12,headT:2,  lAs:-45, lAe:15,  rAs:18,  rAe:-28, lHip:8,  lKnee:-8,  rHip:-6, rKnee:8  },
    ],
    heavy: [
      { lean:5,  squat:0.15,headT:2,  lAs:-25, lAe:35,  rAs:60,  rAe:-20, lHip:8,  lKnee:-8,  rHip:-8, rKnee:10 },
      { lean:30, squat:0.3, headT:12, lAs:-30, lAe:40,  rAs:-110,rAe:15,  lHip:25, lKnee:-15, rHip:-10,rKnee:12 },
      { lean:35, squat:0.28,headT:14, lAs:-28, lAe:38,  rAs:-120,rAe:20,  lHip:28, lKnee:-18, rHip:-12,rKnee:14 },
      { lean:10, squat:0.18,headT:4,  lAs:-25, lAe:35,  rAs:-60, rAe:10,  lHip:10, lKnee:-8,  rHip:-8, rKnee:10 },
    ],
    block: [
      { lean:-8, squat:0.3, headT:-10,lAs:-40, lAe:90,  rAs:-50, rAe:85,  lHip:-5, lKnee:20,  rHip:5,  rKnee:-20},
      { lean:-8, squat:0.32,headT:-10,lAs:-38, lAe:88,  rAs:-48, rAe:83,  lHip:-5, lKnee:20,  rHip:5,  rKnee:-20},
    ],
    hurt: [
      { lean:-20,squat:0.2, headT:-15,lAs:50,  lAe:-20, rAs:40,  rAe:-15, lHip:-10,lKnee:8,   rHip:10, rKnee:-8 },
      { lean:-15,squat:0.15,headT:-10,lAs:40,  lAe:-15, rAs:30,  rAe:-10, lHip:-8, lKnee:5,   rHip:8,  rKnee:-5 },
    ],
    ko: [
      { lean:80, squat:0.9, headT:60, lAs:30,  lAe:-10, rAs:20,  rAe:-5,  lHip:20, lKnee:-10, rHip:-10,rKnee:5  },
    ],
    special1: [ // projectile — wind-up and throw
      { lean:5,  squat:0.1, headT:3,  lAs:-25, lAe:35,  rAs:80,  rAe:-40, lHip:6,  lKnee:-8,  rHip:-6, rKnee:8  },
      { lean:15, squat:0.15,headT:8,  lAs:-20, lAe:30,  rAs:-90, rAe:20,  lHip:10, lKnee:-10, rHip:-8, rKnee:10 },
      { lean:20, squat:0.18,headT:10, lAs:-20, lAe:30,  rAs:-130,rAe:30,  lHip:12, lKnee:-10, rHip:-8, rKnee:10 },
      { lean:5,  squat:0.1, headT:2,  lAs:-20, lAe:30,  rAs:-50, rAe:10,  lHip:6,  lKnee:-8,  rHip:-6, rKnee:8  },
    ],
    special2: [ // rising uppercut
      { lean:5,  squat:0.4, headT:5,  lAs:-20, lAe:30,  rAs:60,  rAe:-30, lHip:10, lKnee:-20, rHip:-10,rKnee:20 },
      { lean:-20,squat:0.0, headT:-15,lAs:-20, lAe:30,  rAs:-140,rAe:40,  lHip:-20,lKnee:10,  rHip:20, rKnee:-10},
      { lean:-25,squat:0.0, headT:-18,lAs:-15, lAe:25,  rAs:-150,rAe:50,  lHip:-25,lKnee:15,  rHip:25, rKnee:-15},
    ],
    special3: [ // dash lunge
      { lean:30, squat:0.1, headT:12, lAs:-80, lAe:20,  rAs:-80, rAe:20,  lHip:50, lKnee:-40, rHip:-20,rKnee:10 },
      { lean:35, squat:0.0, headT:15, lAs:-90, lAe:30,  rAs:-90, rAe:30,  lHip:60, lKnee:-50, rHip:-30,rKnee:15 },
    ],
    super: [ // finisher — dramatic charge then explosion pose
      { lean:-10,squat:0.5, headT:-8, lAs:60,  lAe:-30, rAs:-60, rAe:30,  lHip:-20,lKnee:30,  rHip:20, rKnee:-30},
      { lean:-15,squat:0.6, headT:-10,lAs:80,  lAe:-40, rAs:-80, rAe:40,  lHip:-25,lKnee:40,  rHip:25, rKnee:-40},
      { lean:40, squat:0.0, headT:18, lAs:-120,lAe:40,  rAs:-120,rAe:40,  lHip:30, lKnee:-20, rHip:30, rKnee:-20},
      { lean:42, squat:0.0, headT:20, lAs:-130,lAe:50,  rAs:-130,rAe:50,  lHip:35, lKnee:-25, rHip:35, rKnee:-25},
    ],
  };

  // ── LERP POSE ─────────────────────────────────────────────────────────────────
  function _lerp(a, b, t) { return a + (b - a) * t; }

  function _getPose(state, t) {
    const frames = ANIM[state] || ANIM.idle;
    if (frames.length === 1) return frames[0];
    const idx   = Math.floor(t * frames.length);
    const frac  = (t * frames.length) - idx;
    const fa    = frames[Math.min(idx, frames.length - 1)];
    const fb    = frames[Math.min(idx + 1, frames.length - 1)];
    const k     = Object.keys(fa);
    const out   = {};
    k.forEach(key => { out[key] = _lerp(fa[key], fb[key], frac); });
    return out;
  }

  // ── DRAW ROUNDED LIMB SEGMENT ─────────────────────────────────────────────────
  function _seg(ctx, x1, y1, x2, y2, r1, r2, color, glowColor, glowAmt) {
    ctx.save();
    if (glowAmt > 0) { ctx.shadowColor = glowColor; ctx.shadowBlur = glowAmt; }
    ctx.fillStyle = color;
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.max(0.01, Math.sqrt(dx*dx + dy*dy));
    const nx = -dy / len, ny = dx / len;

    ctx.beginPath();
    ctx.moveTo(x1 + nx*r1, y1 + ny*r1);
    ctx.lineTo(x2 + nx*r2, y2 + ny*r2);
    ctx.arc(x2, y2, r2, Math.atan2(ny, nx), Math.atan2(-ny, -nx));
    ctx.lineTo(x1 - nx*r1, y1 - ny*r1);
    ctx.arc(x1, y1, r1, Math.atan2(-ny, -nx), Math.atan2(ny, nx));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function _circle(ctx, cx, cy, r, color, glowColor, glowAmt) {
    ctx.save();
    if (glowAmt > 0) { ctx.shadowColor = glowColor; ctx.shadowBlur = glowAmt; }
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }

  // ── DRAW A JOINT (circle at limb junction) ────────────────────────────────────
  function _joint(ctx, x, y, r, color) {
    ctx.save(); ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }

  // ── MAIN CHARACTER DRAW FUNCTION ─────────────────────────────────────────────
  // x, groundY: world position (x=center, groundY=feet y in canvas coords)
  // charH: character height in canvas pixels
  // facing: 1=right, -1=left
  // opts: { flashHit, alpha, charged }
  function draw(ctx, charId, animState, animT, x, groundY, charH, facing, opts) {
    opts = opts || {};
    const cfg = CFG[charId] || CFG[1];
    const pose = _getPose(animState || 'idle', animT || 0);

    const H = charH * cfg.height;   // actual draw height
    const B = cfg.bulk;              // width multiplier

    // Body measurements (all relative to H)
    const TORSO_TOP  = H * 0.70;  // shoulder height from ground
    const TORSO_BOT  = H * 0.44;  // hip height from ground
    const HEAD_R     = H * 0.115;
    const LIMB_W     = H * 0.065 * B; // limb thickness
    const LIMB_W_S   = LIMB_W * 0.82; // slim forearm/shin

    // Squat offset compresses legs
    const squat = pose.squat || 0;
    const sqY   = squat * H * 0.22;

    // Torso lean (rotate around hip point)
    const leanRad = (pose.lean || 0) * Math.PI / 180;

    // Head position (atop torso, affected by lean)
    const headBaseY = groundY - TORSO_TOP + sqY;
    const headOffX  = Math.sin(leanRad) * (TORSO_TOP - TORSO_BOT) * 0.7;
    const headX     = x + headOffX * facing;
    const headY     = headBaseY - HEAD_R;

    // Shoulder positions (top of torso + lean)
    const shoulderW = H * 0.17 * B;
    const shoulderY = groundY - TORSO_TOP + sqY;
    const shoulderOffX = Math.sin(leanRad) * (TORSO_TOP - TORSO_BOT);
    const shoulderMidX = x + shoulderOffX * facing;
    const lShoulderX = shoulderMidX - shoulderW * facing;
    const rShoulderX = shoulderMidX + shoulderW * facing;

    // Hip positions
    const hipY   = groundY - TORSO_BOT + sqY;
    const hipW   = H * 0.12 * B;
    const lHipX  = x - hipW * facing;
    const rHipX  = x + hipW * facing;

    // Hit flash overlay
    const flashAlpha = Math.min(1, (opts.flashHit || 0));
    const baseAlpha  = opts.alpha !== undefined ? opts.alpha : 1;

    ctx.save();
    ctx.globalAlpha = baseAlpha;

    // ── Ground shadow ──────────────────────────────────────────────────────────
    ctx.save();
    ctx.globalAlpha = baseAlpha * 0.35;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(x, groundY, H*0.16*B, H*0.05, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    // ── Charged aura ──────────────────────────────────────────────────────────
    if (opts.charged) {
      ctx.save();
      const p = 0.5 + 0.5 * Math.sin(performance.now() / 100);
      ctx.globalAlpha = baseAlpha * (0.18 + p * 0.28);
      ctx.shadowColor = cfg.glow; ctx.shadowBlur = 40;
      ctx.strokeStyle = cfg.col1; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(x, groundY - H*0.5, H*0.20*B, H*0.55, 0, 0, Math.PI*2);
      ctx.stroke();
      ctx.restore();
    }

    // ── BACK LEG (left leg when facing right = back leg) ───────────────────────
    {
      const hipAngle = ((pose.lHip || 0)) * Math.PI / 180;
      const kneeAngle= ((pose.lKnee || 0)) * Math.PI / 180;
      const legLen = H * 0.27;

      const kneeX = lHipX + Math.sin(hipAngle) * legLen * facing;
      const kneeY = hipY  + Math.cos(hipAngle) * legLen;
      const footX = kneeX + Math.sin(hipAngle + kneeAngle) * legLen * facing;
      const footY = kneeY + Math.cos(hipAngle + kneeAngle) * legLen;

      const col = cfg.col2;
      _seg(ctx, lHipX, hipY, kneeX, kneeY, LIMB_W, LIMB_W, col, cfg.glow, 4);
      _joint(ctx, kneeX, kneeY, LIMB_W*0.9, col);
      _seg(ctx, kneeX, kneeY, footX, footY, LIMB_W, LIMB_W_S, col, cfg.glow, 4);
      // Foot
      ctx.save(); ctx.fillStyle = '#222'; ctx.shadowColor=cfg.glow; ctx.shadowBlur=6;
      ctx.beginPath(); ctx.ellipse(footX, footY, LIMB_W_S*1.5, LIMB_W_S*0.55, -0.2*facing, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }

    // ── BACK ARM ──────────────────────────────────────────────────────────────
    {
      const sAngle = ((pose.lAs || 0)) * Math.PI / 180;
      const eAngle = ((pose.lAe || 0)) * Math.PI / 180;
      const armLen = H * 0.24;

      const elbowX = lShoulderX + Math.sin(sAngle) * armLen * facing;
      const elbowY = shoulderY  + Math.cos(sAngle) * armLen;
      const handX  = elbowX    + Math.sin(sAngle + eAngle) * armLen * 0.88 * facing;
      const handY  = elbowY    + Math.cos(sAngle + eAngle) * armLen * 0.88;

      _seg(ctx, lShoulderX, shoulderY, elbowX, elbowY, LIMB_W*0.88, LIMB_W*0.78, cfg.col2, cfg.glow, 4);
      _joint(ctx, elbowX, elbowY, LIMB_W*0.7, cfg.col2);
      _seg(ctx, elbowX, elbowY, handX, handY, LIMB_W*0.78, LIMB_W*0.6, cfg.col2, cfg.glow, 4);
      _circle(ctx, handX, handY, LIMB_W*0.7, cfg.skin, cfg.glow, 3);
    }

    // ── TORSO ─────────────────────────────────────────────────────────────────
    {
      const sw = shoulderW * 2;
      const hw = hipW * 2;
      const col = cfg.col1;

      ctx.save();
      ctx.shadowColor = cfg.glow; ctx.shadowBlur = 12;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(shoulderMidX - sw*0.5*facing, shoulderY);
      ctx.lineTo(shoulderMidX + sw*0.5*facing, shoulderY);
      ctx.lineTo(x + hw*0.5*facing, hipY);
      ctx.lineTo(x - hw*0.5*facing, hipY);
      ctx.closePath();
      ctx.fill();

      // Torso highlight stripe
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(shoulderMidX - sw*0.18*facing, shoulderY);
      ctx.lineTo(shoulderMidX + sw*0.06*facing, shoulderY);
      ctx.lineTo(x + hw*0.04*facing, hipY);
      ctx.lineTo(x - hw*0.14*facing, hipY);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Collar line
      ctx.save();
      ctx.strokeStyle = cfg.col2; ctx.lineWidth = LIMB_W * 0.35;
      ctx.beginPath();
      ctx.moveTo(shoulderMidX - sw*0.25*facing, shoulderY);
      ctx.lineTo(shoulderMidX, shoulderY + H*0.06);
      ctx.lineTo(shoulderMidX + sw*0.25*facing, shoulderY);
      ctx.stroke();
      ctx.restore();
    }

    // ── HEAD ──────────────────────────────────────────────────────────────────
    {
      // Neck
      _seg(ctx, shoulderMidX, shoulderY, headX, headY + HEAD_R, HEAD_R*0.45, HEAD_R*0.38, cfg.skin, cfg.glow, 5);

      // Head base
      _circle(ctx, headX, headY, HEAD_R, cfg.skin, cfg.glow, 10);

      // Hair / color accent on top of head
      ctx.save();
      ctx.fillStyle = cfg.col1;
      ctx.shadowColor = cfg.glow; ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(headX, headY - HEAD_R*0.05, HEAD_R, Math.PI, 2*Math.PI);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Eyes
      const eyeOff = HEAD_R * 0.28 * facing;
      const eyeY   = headY - HEAD_R * 0.08;
      const eyeR   = HEAD_R * 0.13;
      ctx.save(); ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(headX + eyeOff, eyeY, eyeR, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.arc(headX + eyeOff + eyeR*0.2*facing, eyeY, eyeR*0.55, 0, Math.PI*2); ctx.fill();
      ctx.restore();

      // Head tilt expression (eyebrow for intensity in attack states)
      if (['light','heavy','special1','special2','special3','super'].includes(animState)) {
        ctx.save();
        ctx.strokeStyle = '#333'; ctx.lineWidth = HEAD_R*0.12;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(headX + eyeOff - eyeR*facing, eyeY - eyeR*1.6);
        ctx.lineTo(headX + eyeOff + eyeR*facing, eyeY - eyeR*1.0);
        ctx.stroke();
        ctx.restore();
      }
    }

    // ── FRONT LEG ─────────────────────────────────────────────────────────────
    {
      const hipAngle = ((pose.rHip || 0)) * Math.PI / 180;
      const kneeAngle= ((pose.rKnee || 0)) * Math.PI / 180;
      const legLen   = H * 0.27;

      const kneeX = rHipX + Math.sin(hipAngle) * legLen * facing;
      const kneeY = hipY  + Math.cos(hipAngle) * legLen;
      const footX = kneeX + Math.sin(hipAngle + kneeAngle) * legLen * facing;
      const footY = kneeY + Math.cos(hipAngle + kneeAngle) * legLen;

      _seg(ctx, rHipX, hipY, kneeX, kneeY, LIMB_W, LIMB_W, cfg.col1, cfg.glow, 6);
      _joint(ctx, kneeX, kneeY, LIMB_W*0.9, cfg.col1);
      _seg(ctx, kneeX, kneeY, footX, footY, LIMB_W, LIMB_W_S, cfg.col1, cfg.glow, 6);
      ctx.save(); ctx.fillStyle = '#1a1a1a'; ctx.shadowColor=cfg.glow; ctx.shadowBlur=8;
      ctx.beginPath(); ctx.ellipse(footX, footY, LIMB_W_S*1.6, LIMB_W_S*0.6, -0.2*facing, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }

    // ── FRONT ARM ─────────────────────────────────────────────────────────────
    {
      const sAngle = ((pose.rAs || 0)) * Math.PI / 180;
      const eAngle = ((pose.rAe || 0)) * Math.PI / 180;
      const armLen  = H * 0.24;

      const elbowX = rShoulderX + Math.sin(sAngle) * armLen * facing;
      const elbowY = shoulderY  + Math.cos(sAngle) * armLen;
      const handX  = elbowX    + Math.sin(sAngle + eAngle) * armLen * 0.88 * facing;
      const handY  = elbowY    + Math.cos(sAngle + eAngle) * armLen * 0.88;

      _seg(ctx, rShoulderX, shoulderY, elbowX, elbowY, LIMB_W*0.9, LIMB_W*0.8, cfg.col1, cfg.glow, 7);
      _joint(ctx, elbowX, elbowY, LIMB_W*0.72, cfg.col1);
      _seg(ctx, elbowX, elbowY, handX, handY, LIMB_W*0.8, LIMB_W*0.62, cfg.col1, cfg.glow, 7);
      _circle(ctx, handX, handY, LIMB_W*0.74, cfg.skin, cfg.glow, 6);

      // Store hand position for accessories
      cfg._handX = handX; cfg._handY = handY;
    }

    // ── ACCESSORIES ───────────────────────────────────────────────────────────
    _drawAccessory(ctx, cfg, x, groundY, H, headX, headY, HEAD_R, facing, animState);

    // ── HIT FLASH ─────────────────────────────────────────────────────────────
    if (flashAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = flashAlpha * 0.7;
      ctx.fillStyle = '#fff';
      ctx.shadowColor = '#fff'; ctx.shadowBlur = 40;
      ctx.fillRect(x - H*0.25*B, groundY - H, H*0.5*B, H);
      ctx.restore();
    }

    ctx.restore();
  }

  // ── ACCESSORY DRAWING ─────────────────────────────────────────────────────────
  function _drawAccessory(ctx, cfg, cx, groundY, H, hx, hy, hr, facing, state) {
    const hndX = cfg._handX || cx;
    const hndY = cfg._handY || (groundY - H*0.35);

    switch (cfg.acc) {
      case 'mic': {
        // Microphone — stick + ball at hand
        const mx = hndX + hr*0.3*facing;
        const my = hndY;
        ctx.save();
        ctx.strokeStyle = '#aaa'; ctx.lineWidth = hr*0.2; ctx.lineCap='round';
        ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx, my - H*0.14); ctx.stroke();
        ctx.shadowColor = cfg.glow; ctx.shadowBlur = 12;
        ctx.fillStyle = '#ccc';
        ctx.beginPath(); ctx.arc(mx, my - H*0.17, hr*0.38, 0, Math.PI*2); ctx.fill();
        // Grill lines
        ctx.strokeStyle = '#888'; ctx.lineWidth = 1;
        [-1,0,1].forEach(i => {
          ctx.beginPath();
          ctx.arc(mx, my - H*0.17, hr*0.28, Math.PI*0.1 + i*0.3, Math.PI*0.9 + i*0.3);
          ctx.stroke();
        });
        ctx.restore();
        break;
      }
      case 'headphones': {
        ctx.save();
        ctx.strokeStyle = cfg.col1; ctx.lineWidth = hr*0.35;
        ctx.shadowColor = cfg.glow; ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(hx, hy - hr*0.2, hr*1.05, Math.PI*1.1, Math.PI*1.9);
        ctx.stroke();
        // Ear cups
        [[-1],[1]].forEach(([s]) => {
          ctx.fillStyle = cfg.col2;
          ctx.beginPath();
          ctx.arc(hx + s*hr*0.95, hy - hr*0.2, hr*0.32, 0, Math.PI*2);
          ctx.fill();
        });
        ctx.restore();
        break;
      }
      case 'flames': {
        if (state === 'idle' || state === 'walk') {
          ctx.save();
          const t = performance.now() / 300;
          for (let i = 0; i < 5; i++) {
            const fx = hndX + (i - 2) * H*0.025;
            const fy = hndY - H*0.03;
            const h2 = H * (0.04 + 0.025 * Math.sin(t + i));
            const g  = ctx.createLinearGradient(fx, fy, fx, fy - h2);
            g.addColorStop(0, '#ff4400'); g.addColorStop(0.5,'#ff8800'); g.addColorStop(1,'transparent');
            ctx.fillStyle = g; ctx.shadowColor='#ff6600'; ctx.shadowBlur=12;
            ctx.globalAlpha = 0.85;
            ctx.beginPath();
            ctx.ellipse(fx, fy - h2*0.5, H*0.018, h2*0.5, 0.1*Math.sin(t+i), 0, Math.PI*2);
            ctx.fill();
          }
          ctx.restore();
        }
        break;
      }
      case 'bolt': {
        if (['light','heavy','special1','special2','super'].includes(state)) {
          ctx.save();
          ctx.strokeStyle = '#ffee00'; ctx.lineWidth = hr*0.28;
          ctx.shadowColor = '#ffff44'; ctx.shadowBlur = 18;
          ctx.globalAlpha = 0.9;
          const bx = hndX, by = hndY;
          ctx.beginPath();
          ctx.moveTo(bx, by - H*0.12);
          ctx.lineTo(bx - H*0.025*facing, by - H*0.04);
          ctx.lineTo(bx + H*0.015*facing, by - H*0.04);
          ctx.lineTo(bx - H*0.01*facing, by + H*0.04);
          ctx.stroke();
          ctx.restore();
        }
        break;
      }
      case 'shield': {
        ctx.save();
        ctx.fillStyle = cfg.col2; ctx.strokeStyle = '#88aaff';
        ctx.lineWidth = hr*0.2; ctx.shadowColor='#aaaaff'; ctx.shadowBlur=14;
        const sx = hndX - H*0.07*facing, sy = hndY - H*0.1;
        ctx.beginPath();
        ctx.moveTo(sx, sy - H*0.12);
        ctx.lineTo(sx + H*0.08*facing, sy - H*0.06);
        ctx.lineTo(sx + H*0.08*facing, sy + H*0.04);
        ctx.lineTo(sx, sy + H*0.1);
        ctx.lineTo(sx - H*0.08*facing, sy + H*0.04);
        ctx.lineTo(sx - H*0.08*facing, sy - H*0.06);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.restore();
        break;
      }
      case 'camera_flash': {
        if (['special1','super','light'].includes(state)) {
          ctx.save();
          ctx.fillStyle = '#fff'; ctx.shadowColor='#fff'; ctx.shadowBlur=60;
          ctx.globalAlpha = 0.85;
          ctx.beginPath(); ctx.arc(hndX, hndY, H*0.04, 0, Math.PI*2); ctx.fill();
          ctx.restore();
        }
        break;
      }
      default: break;
    }
  }

  // ── VFX ENGINE ────────────────────────────────────────────────────────────────
  const _particles = [];
  let _superFlashAlpha = 0;
  let _screenShake = { x: 0, y: 0, mag: 0, decay: 0 };

  // Hit spark — level: 1=light, 2=heavy, 3=special, 4=super
  function spawnHitSpark(x, y, level, color) {
    const count = [6, 10, 16, 28][Math.min(3, level - 1)];
    const speed = [180, 280, 380, 520][Math.min(3, level - 1)];
    const life  = [0.20, 0.30, 0.40, 0.55][Math.min(3, level - 1)];
    const sizes = [4, 7, 10, 16][Math.min(3, level - 1)];

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd   = speed * (0.5 + Math.random() * 0.8);
      _particles.push({
        type: 'spark',
        x, y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd - 80,
        life, maxLife: life,
        color: level >= 3 ? (i % 2 === 0 ? '#fff' : color) : color,
        size: sizes * (0.5 + Math.random() * 0.8),
      });
    }

    // Impact flash ring
    _particles.push({ type: 'ring', x, y, r: 0, maxR: sizes * 6, life: 0.18, maxLife: 0.18, color });

    // Screen shake
    const mag = [3, 6, 10, 20][Math.min(3, level - 1)];
    _screenShake = { mag, decay: mag / 0.18, x: 0, y: 0 };
  }

  // Special effect types: 'projectile_trail', 'rising_trail', 'lunge_trail', 'super_burst'
  function spawnSpecialVFX(type, x, y, color, facing) {
    facing = facing || 1;
    if (type === 'projectile_trail') {
      for (let i = 0; i < 8; i++) {
        _particles.push({
          type: 'trail',
          x: x - facing * i * 10,
          y: y + (Math.random() - 0.5) * 14,
          vx: -facing * 20, vy: (Math.random()-0.5)*40,
          life: 0.35 - i*0.03, maxLife: 0.35,
          color, size: 10 - i,
        });
      }
      // Projectile ring
      _particles.push({ type: 'ring', x, y, r: 0, maxR: 40, life: 0.25, maxLife: 0.25, color: '#fff' });
    } else if (type === 'rising_trail') {
      for (let i = 0; i < 12; i++) {
        _particles.push({
          type: 'trail',
          x: x + (Math.random()-0.5)*20,
          y: y + i*8,
          vx: (Math.random()-0.5)*60, vy: -30,
          life: 0.4 - i*0.02, maxLife: 0.4,
          color, size: 8 - i*0.5,
        });
      }
    } else if (type === 'lunge_trail') {
      for (let i = 0; i < 10; i++) {
        _particles.push({
          type: 'trail',
          x: x - facing * i * 14,
          y: y + (Math.random()-0.5)*20,
          vx: -facing*60, vy:(Math.random()-0.5)*30,
          life: 0.3 - i*0.02, maxLife: 0.3,
          color, size: 12 - i,
        });
      }
    } else if (type === 'super_burst') {
      for (let i = 0; i < 40; i++) {
        const angle = Math.random() * Math.PI * 2;
        const spd   = 200 + Math.random() * 400;
        _particles.push({
          type: 'spark',
          x, y,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd - 150,
          life: 0.6 + Math.random()*0.3,
          maxLife: 0.9,
          color: i%3===0 ? '#fff' : i%3===1 ? color : '#ffd700',
          size: 4 + Math.random() * 14,
        });
      }
      _particles.push({ type: 'ring', x, y, r: 0, maxR: 180, life: 0.5, maxLife: 0.5, color: '#fff' });
      _particles.push({ type: 'ring', x, y, r: 0, maxR: 280, life: 0.7, maxLife: 0.7, color });
      _superFlashAlpha = 0.85;
      _screenShake = { mag: 22, decay: 22 / 0.25 };
    }
  }

  // Super flash (white screen flash)
  function superFlash(duration) {
    _superFlashAlpha = 1;
  }

  function updateVFX(dt) {
    // Update particles
    for (let i = _particles.length - 1; i >= 0; i--) {
      const p = _particles[i];
      p.life -= dt;
      if (p.life <= 0) { _particles.splice(i, 1); continue; }
      p.x  += p.vx * dt;
      p.y  += p.vy * dt;
      p.vy += 400 * dt; // gravity for sparks
      if (p.type === 'ring') p.r = p.maxR * (1 - p.life / p.maxLife);
    }
    // Super flash decay
    if (_superFlashAlpha > 0) _superFlashAlpha = Math.max(0, _superFlashAlpha - dt * 3);
    // Screen shake decay
    if (_screenShake.mag > 0) {
      _screenShake.mag = Math.max(0, _screenShake.mag - _screenShake.decay * dt);
      _screenShake.x = (Math.random()-0.5)*2 * _screenShake.mag;
      _screenShake.y = (Math.random()-0.5)*2 * _screenShake.mag;
    }
  }

  function drawVFX(ctx, W, H) {
    // Draw particles
    _particles.forEach(p => {
      const a = Math.max(0, p.life / p.maxLife);
      ctx.save();
      ctx.globalAlpha = a;

      if (p.type === 'spark') {
        ctx.shadowColor = p.color; ctx.shadowBlur = p.size;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI*2);
        ctx.fill();
        // Streak
        ctx.strokeStyle = p.color; ctx.lineWidth = p.size * 0.3;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx*0.04, p.y - p.vy*0.04); ctx.stroke();
      } else if (p.type === 'trail') {
        ctx.shadowColor = p.color; ctx.shadowBlur = p.size * 2;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
        g.addColorStop(0, '#fff');
        g.addColorStop(0.4, p.color);
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill();
      } else if (p.type === 'ring') {
        ctx.strokeStyle = p.color; ctx.lineWidth = 3; ctx.globalAlpha = a * 0.8;
        ctx.shadowColor = p.color; ctx.shadowBlur = 20;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.stroke();
      }

      ctx.restore();
    });

    // Super flash overlay
    if (_superFlashAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = _superFlashAlpha;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }

  // Expose screen shake offset for canvas translate
  function getScreenShake() {
    return { x: _screenShake.x || 0, y: _screenShake.y || 0 };
  }

  return { draw, spawnHitSpark, spawnSpecialVFX, superFlash, updateVFX, drawVFX, getScreenShake };
})();

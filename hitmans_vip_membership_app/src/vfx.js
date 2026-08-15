// HVAS VFX — the feedback layer.
//
// One shared canvas for every burst in the app, sized to the viewport and
// pointer-events:none so it never eats a tap. The render loop only runs while
// there is something alive on it, so an idle card costs nothing — this runs on
// phones in a dark room all night and must not sit at 60fps doing nothing.
//
// Everything here is decoration. If it fails, or the user has asked for
// reduced motion, the app behaves exactly the same — callers never branch on
// whether a burst happened.

const REDUCED = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

let canvas = null;
let ctx = null;
let dpr = 1;
let particles = [];
let raf = 0;
let last = 0;

function mount() {
  if (canvas || typeof document === 'undefined') return;
  canvas = document.createElement('canvas');
  canvas.className = 'hvas-vfx';
  document.body.appendChild(canvas);
  ctx = canvas.getContext('2d');
  resize();
  addEventListener('resize', resize, { passive: true });
}

function resize() {
  if (!canvas) return;
  dpr = Math.min(devicePixelRatio || 1, 2); // capping at 2 halves the fill cost on 3x phones
  canvas.width = Math.floor(innerWidth * dpr);
  canvas.height = Math.floor(innerHeight * dpr);
  canvas.style.width = `${innerWidth}px`;
  canvas.style.height = `${innerHeight}px`;
}

function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.05); // clamp so a backgrounded tab doesn't teleport everything
  last = now;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  let alive = 0;
  for (const p of particles) {
    p.life -= dt;
    if (p.life <= 0) continue;
    alive++;
    p.vy += p.g * dt;
    p.vx *= p.drag;
    p.vy *= p.drag;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.spin * dt;
    const t = p.life / p.max;
    ctx.globalAlpha = Math.min(1, t * 1.6);
    ctx.save();
    ctx.translate(p.x * dpr, p.y * dpr);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    if (p.shape === 'rect') ctx.fillRect(-p.r * dpr, -p.r * dpr * 0.45, p.r * 2 * dpr, p.r * 0.9 * dpr);
    else if (p.shape === 'spark') {
      ctx.fillRect(-p.r * dpr * 0.18, -p.r * dpr, p.r * 0.36 * dpr, p.r * 2 * dpr);
      ctx.fillRect(-p.r * dpr, -p.r * dpr * 0.18, p.r * 2 * dpr, p.r * 0.36 * dpr);
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, p.r * dpr * t, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  particles = alive ? particles.filter((p) => p.life > 0) : [];
  raf = particles.length ? requestAnimationFrame(loop) : 0;
}

function run() {
  if (raf) return;
  last = performance.now();
  raf = requestAnimationFrame(loop);
}

function emit(list) {
  if (REDUCED()) return;
  mount();
  if (!ctx) return;
  // Hard ceiling. A player tapping fast during a blackout round can otherwise
  // stack hundreds of particles on a phone that cannot afford them.
  if (particles.length > 420) particles.splice(0, particles.length - 420);
  particles.push(...list);
  run();
}

const rand = (a, b) => a + Math.random() * (b - a);

// Where a burst should originate: the middle of an element, in page space.
export function centerOf(el) {
  if (!el?.getBoundingClientRect) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
}

// Covering a square. Small, quick, directional — it should feel like the tile
// snapped shut, not like a firework.
export function burstCover(el, tone = 'violet') {
  const c = centerOf(el);
  if (!c) return;
  const palette = tone === 'lipsync'
    ? ['#ff3df0', '#ff9df7', '#ffffff']
    : ['#a935ff', '#d4a3ff', '#22d3ee', '#ffffff'];
  const out = [];
  for (let i = 0; i < 14; i++) {
    const a = rand(0, Math.PI * 2);
    const sp = rand(60, 190);
    out.push({
      x: c.x, y: c.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      g: 320, drag: 0.94, r: rand(1.6, 3.4), rot: 0, spin: 0,
      color: palette[(Math.random() * palette.length) | 0],
      shape: 'dot', life: rand(0.34, 0.6), max: 0.6,
    });
  }
  emit(out);
}


// Taking a round. Confetti from the top corners plus a burst off the card, so
// the whole screen reacts and not just one tile.
export function celebrate(el) {
  const out = [];
  const colors = ['#ffcf47', '#ffe9a8', '#a935ff', '#ff3df0', '#22d3ee', '#39ff88', '#ffffff'];
  for (const originX of [innerWidth * 0.08, innerWidth * 0.92]) {
    const dir = originX < innerWidth / 2 ? 1 : -1;
    for (let i = 0; i < 60; i++) {
      out.push({
        x: originX, y: -12, vx: dir * rand(60, 340), vy: rand(140, 460),
        g: 640, drag: 0.995, r: rand(3, 6.5), rot: rand(0, 6.3), spin: rand(-9, 9),
        color: colors[(Math.random() * colors.length) | 0], shape: 'rect',
        life: rand(1.5, 2.6), max: 2.6,
      });
    }
  }
  const c = centerOf(el);
  if (c) {
    for (let i = 0; i < 34; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(120, 420);
      out.push({
        x: c.x, y: c.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        g: 380, drag: 0.95, r: rand(2, 4.5), rot: 0, spin: rand(-6, 6),
        color: colors[(Math.random() * colors.length) | 0], shape: 'spark',
        life: rand(0.7, 1.3), max: 1.3,
      });
    }
  }
  emit(out);
}


export function clearVfx() {
  particles = [];
  if (raf) { cancelAnimationFrame(raf); raf = 0; }
  if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
}

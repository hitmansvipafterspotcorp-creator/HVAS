// The app's chrome, checked at source level.
//
// The UI kit this venue is built on draws a light keyline around everything.
// On the sheet it was cut from that is a crisp edge; on a near-black screen
// next to magenta artwork it reads as a WHITE BORDER, which is the single
// thing that made the app look cheap. Sixteen sprites were repainted (see
// tools/neon-rim.py) and the CSS edge token was moved off grey.
//
// None of that stays fixed on its own. A white hairline is the most natural
// thing in the world to type, so this fails the deploy if one comes back.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, '../hitmans_vip_membership_app/src/kit.css'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); c ? pass++ : fail++; };

// Strip comments so prose about white borders does not fail a test about them.
const code = css.replace(/\/\*[\s\S]*?\*\//g, '');

console.log('\nNO WHITE BORDERS');
// A border is the whole complaint. Backgrounds and text may be white.
const whiteBorders = code.split('\n')
  .map((l, i) => [i + 1, l])
  .filter(([, l]) => /border(-(top|right|bottom|left))?\s*:[^;]*(#fff\b|#ffffff\b|\bwhite\b|rgba\(\s*255,\s*255,\s*255)/i.test(l));
whiteBorders.forEach(([n, l]) => console.log(`    kit.css:${n}  ${l.trim().slice(0, 90)}`));
ok(whiteBorders.length === 0, `no white border declarations (${whiteBorders.length} found)`);

console.log('\nTHE EDGE TOKEN IS A COLOUR, NOT A GREY');
const edge = code.match(/--k-edge-soft:\s*([^;]+);/);
ok(!!edge, 'the soft edge token exists');
const rgba = edge && edge[1].match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
ok(!!rgba, `and is an rgb value (${edge?.[1].trim()})`);
if (rgba) {
  const [r, g, b] = rgba.slice(1).map(Number);
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  // A grey has no spread between channels, and grey on near-black next to
  // magenta is exactly what reads as white.
  ok(spread > 60, `carrying real hue rather than grey (channel spread ${spread})`);
  ok(r > g && b > g, 'in the violet/magenta family the rest of the app is in');
}

console.log('\nSTALE WHITE FALLBACKS ARE GONE');
// var(--token, white) only fires if the token is deleted — in which case white
// is the worst possible thing to land on, and it lands silently.
const fallbacks = code.match(/var\(--k-(?:edge|line|hair|border)[a-z-]*,\s*(?:#fff\b|#ffffff\b|white|rgba?\(\s*255,\s*255,\s*255)[^)]*\)/gi) || [];
fallbacks.slice(0, 5).forEach((f) => console.log(`    ${f}`));
ok(fallbacks.length === 0, `no white fallbacks behind edge tokens (${fallbacks.length} found)`);

console.log('\nTHE FAINT EDGE BLOOM IS SEPARATE FROM THE LOUD ONE');
const edgeGlow = code.match(/--k-glow-edge:\s*[^;]*rgba\([^)]*?([\d.]+)\s*\)/);
const violet = code.match(/--k-glow-violet:\s*[^;]*rgba\([^)]*?([\d.]+)\s*\)/);
ok(!!edgeGlow, 'a panel-edge glow token exists');
// It sits on every panel at once. A glow on everything is a glow on nothing.
ok(edgeGlow && violet && Number(edgeGlow[1]) < Number(violet[1]),
   `and is weaker than the accent glow (${edgeGlow?.[1]} < ${violet?.[1]})`);

console.log('\nNO SECRETS IN THE SHIPPED BUNDLE');
// The venue codes used to be compiled into the JavaScript, where anybody who
// opened the file could read them — and the gate PRINTED one on screen as a
// "demo" hint whenever no venue was connected. Five taps on a disconnected
// phone showed you the door code in plain text.
//
// This checks the built output, not the source, because the source is not what
// gets served. It needs a build to have run; if dist is missing it says so
// rather than passing on an absence.
const dist = resolve(here, '../hitmans_vip_membership_app/dist/assets');
let bundles = [];
try { bundles = readdirSync(dist).filter((f) => f.endsWith('.js')); } catch { /* no build */ }
ok(bundles.length > 0, `the built bundle exists to check (${bundles.length} files)`);
const js = bundles.map((f) => readFileSync(resolve(dist, f), 'utf8')).join('\n');

// The venue's own codes, whatever they are set to — not just the defaults.
const codes = [process.env.HVAS_STAFF_CODE, process.env.HVAS_HOST_CODE, 'DOOR850', 'HOST850']
  .filter(Boolean);
for (const code of [...new Set(codes)]) {
  ok(!js.includes(code), `the venue code ${code} is not compiled into the client`);
}
// Nothing should be teaching a code on screen either.
ok(!/demo code/i.test(js), 'and no screen offers a "demo code" hint');

// Credentials of every shape anybody might paste into a config by accident.
const SECRETS = [
  [/AIza[A-Za-z0-9_-]{20,}/, 'Google API key'],
  [/sk_live_[A-Za-z0-9]{10,}/, 'live Stripe secret'],
  [/xox[baprs]-[A-Za-z0-9-]{10,}/, 'Slack token'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
  [/ghp_[A-Za-z0-9]{20,}/, 'GitHub token'],
];
for (const [re, what] of SECRETS) ok(!re.test(js), `no ${what} in the client`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

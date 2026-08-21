// The bug this exists to stop:
//
//   function VenueLobby() {
//     const { err } = useBingoState(3000);
//     const [busy, setBusy] = useState(false);
//     if (err === 'not-connected') return <Panel>…</Panel>;   // ← early out
//     const [msg, setMsg] = useState('');                     // ← hook below it
//
// React counts hooks per render. The first render of that screen ran three
// hooks (the venue poll had not answered yet, so err was null); the render
// straight after the poll came back 'not-connected' ran two. React throws
// error #300 and unmounts the entire tree — a white screen, on the phone of
// every member who opened Lip Sync Bingo without a venue.
//
// It shipped. `npm run build` was clean, every server suite was green, and
// nothing failed until a real browser opened the screen. So this is a source
// scan, not a runtime one: no browser, no DOM, fast enough for the deploy gate
// that the venue laptop runs before it ships anything.
//
// The rule it enforces is React's own, and it has no exceptions: every hook a
// component calls must run on every render of that component. Anything else is
// a crash waiting for the right sequence of renders.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILES = [resolve(__dirname, '../hitmans_vip_membership_app/src/main.jsx')];

const HOOK_CALL = /(?:^|[^.\w$])(use[A-Z]\w*)\s*\(/;
const COMPONENT = /^(?:export\s+(?:default\s+)?)?function\s+([A-Z]\w*)\s*\(/;

/** Strip the parts of a line that can't hold real code, so a hook named in a
 *  comment or a string is not mistaken for a call. */
const strip = (line) => line
  .replace(/\/\/.*$/, '')
  .replace(/\/\*.*?\*\//g, '')
  .replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '""');

/** Every hook called after a conditional return, per component. */
export function scan(source) {
  const lines = source.split('\n');
  const found = [];
  let comp = null;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const code = strip(raw);

    // Components are declared at the top level of this file, so a line
    // starting in column 0 with `function Name(` opens one and a `}` in
    // column 0 closes it. Nested helpers are indented and ride along inside.
    if (COMPONENT.test(raw)) {
      comp = { name: raw.match(COMPONENT)[1], at: i + 1, bailedAt: 0, depth: 0, inBlock: false };
      continue;
    }
    if (!comp) continue;
    if (/^\}/.test(raw)) { comp = null; continue; }

    const opens = (code.match(/[{([]/g) || []).length;
    const closes = (code.match(/[})\]]/g) || []).length;

    // A conditional return at the component's own top level (two-space indent)
    // means later renders can stop here. Returns nested deeper belong to a
    // callback or a nested function and do not affect this render's hook count.
    if (!comp.bailedAt && /^ {2}(?:if|switch)\s*\(/.test(code)) comp.inBlock = true;
    if (comp.inBlock && /\breturn\b/.test(code)) { comp.bailedAt = i + 1; comp.inBlock = false; }
    if (comp.inBlock && comp.depth + opens - closes <= 0) comp.inBlock = false;
    comp.depth += opens - closes;

    // Only a hook the component itself calls counts — one inside a useEffect
    // body or an event handler is not part of the render's hook sequence, and
    // those are always indented past the component's own two spaces.
    if (comp.bailedAt && /^ {2}(?:const|let|var|use[A-Z])/.test(code) && HOOK_CALL.test(code)) {
      // A hook-shaped call that sits to the right of an arrow or a nested
      // `function` on the same line belongs to that callback, and runs when the
      // callback runs — not during this render.
      //   const onTap = () => useThing();     ← not a render-time hook
      //   const thing = useThing();           ← is one
      const at = code.search(HOOK_CALL);
      const nested = /=>|\bfunction\s*\(/.exec(code.slice(0, at));
      if (!nested) {
        found.push({ component: comp.name, hook: code.match(HOOK_CALL)[1], line: i + 1, after: comp.bailedAt });
        comp.bailedAt = 0;   // one report per component is enough to fail the gate
      }
    }
  }
  return found;
}

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗', msg); } };

console.log('THE SCANNER CATCHES THE SHAPE THAT SHIPPED');
const shipped = `
function VenueLobby({ navigate }) {
  const { state, err, refresh } = useBingoState(3000);
  const [busy, setBusy] = useState(false);
  if (err === 'not-connected') {
    return (<AppPanel title="Venue Round" />);
  }
  const me = state?.me;
  const [msg, setMsg] = useState('');
  return null;
}
`;
const caught = scan(shipped);
ok(caught.length === 1, `the real bug is flagged (${caught.length} found)`);
ok(caught[0]?.component === 'VenueLobby', 'and named by component');
ok(caught[0]?.hook === 'useState', 'and by which hook is stranded');

console.log('\nAND DOES NOT CRY WOLF');
ok(scan(`
function Fine() {
  const [a, setA] = useState(0);
  const [b, setB] = useState(1);
  if (!a) return null;
  return b;
}
`).length === 0, 'hooks entirely above an early return are fine');

ok(scan(`
function Guarded() {
  const [a, setA] = useState(0);
  useEffect(() => {
    if (!a) return;
    const t = useless(a);
  }, [a]);
  return a;
}
`).length === 0, 'a return inside a useEffect body is not an early return');

ok(scan(`
function Handlers() {
  const [a, setA] = useState(0);
  if (!a) return null;
  const onTap = () => { const x = useTheThing(); return x; };
  return onTap;
}
`).length === 0, 'a hook-shaped call inside a callback after a return is not a render-time hook');

ok(scan(`
function Commented() {
  const [a, setA] = useState(0);
  if (!a) return null;
  // const [b, setB] = useState(1);
  return a;
}
`).length === 0, 'a hook in a comment is not a hook');

ok(scan(`
function Switched() {
  const [a, setA] = useState(0);
  switch (a) { case 1: return 'one'; default: break; }
  const [b, setB] = useState(1);
  return b;
}
`).length === 1, 'a switch that returns counts as an early return too');

console.log('\nTHE REAL APP');
for (const file of FILES) {
  const hits = scan(readFileSync(file, 'utf8'));
  ok(hits.length === 0, `${file.split('/').pop()} calls every hook on every render`);
  for (const h of hits) {
    console.log(`      ${h.component}: ${h.hook}() at line ${h.line} runs only when the return at line ${h.after} does not fire`);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

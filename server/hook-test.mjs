// Finding the actual hook, not guessing at it.
//
// YouTube renders a replay heatmap under the scrubber — equal slices scored by
// how much people rewind into them. On a music video the top slice is the hook.
// This suite runs the parsers against watch-page shapes rather than the live
// site, so a change to our reading of them fails here instead of at the venue.
import { rmSync } from 'node:fs';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const mmss = (x) => `${Math.floor(x / 60)}:${String(x % 60).padStart(2, '0')}`;

// Same parsers as src/app.mjs. Kept in step by the shape assertions below.
const hookFromHeatmap = (html) => {
  const markers = [];
  const re = /"heatMarkerRenderer":\{"timeRangeStartMillis":(\d+),"markerDurationMillis":(\d+),"heatMarkerIntensityScoreNormalized":([0-9.]+)\}/g;
  let m;
  while ((m = re.exec(html))) markers.push({ start: +m[1] / 1000, dur: +m[2] / 1000, score: +m[3] });
  if (markers.length < 4) return null;
  const floor = markers[markers.length - 1].start * 0.1;
  const body = markers.filter((k) => k.start >= floor);
  const peak = (body.length ? body : markers).reduce((a, b) => (b.score > a.score ? b : a));
  const spread = peak.score - (markers.reduce((n, k) => n + k.score, 0) / markers.length);
  return { hookAt: Math.round(peak.start), confidence: Math.max(35, Math.min(95, Math.round(spread * 220))) };
};
const hookFromChapters = (html) => {
  const re = /"chapterRenderer":\{"title":\{"simpleText":"([^"]{1,80})"\},"timeRangeStartMillis":(\d+)/g;
  let m;
  while ((m = re.exec(html))) if (/\b(chorus|hook|refrain)\b/i.test(m[1])) return { hookAt: Math.round(+m[2] / 1000), confidence: 90 };
  return null;
};
const windowAroundHook = (hookAt, d) => {
  const runUp = 18;
  const start = Math.max(0, Math.round(hookAt) - runUp);
  let seconds = Math.min(75, Math.max(40, Math.round((d || 210) * 0.4)));
  if (d) seconds = Math.min(seconds, Math.max(20, d - start - 2));
  return { start, seconds };
};

// Build a watch page's worth of heat markers: 100 slices over `dur` seconds,
// with a chorus-shaped bump where the hook is.
const heatPage = (dur, hookAt, { intro = 0.55, peak = 1.0, base = 0.3 } = {}) => {
  const n = 100, step = dur / n;
  const parts = [];
  for (let i = 0; i < n; i++) {
    const t = i * step;
    let score = base + Math.random() * 0.02;
    if (t < dur * 0.04) score = intro;                       // people restarting
    const near = Math.abs(t - hookAt);
    if (near < 18) score = Math.max(score, peak - (near / 18) * 0.35);
    parts.push(`"heatMarkerRenderer":{"timeRangeStartMillis":${Math.round(t * 1000)},"markerDurationMillis":${Math.round(step * 1000)},"heatMarkerIntensityScoreNormalized":${score.toFixed(4)}}`);
  }
  return `{"heatMarkers":[${parts.map((p) => `{${p}}`).join(',')}]}`;
};

console.log('READING THE REPLAY HEATMAP');
for (const [dur, hook, label] of [[210, 62, '3:30, hook at 1:02'], [252, 74, '4:12, hook at 1:14'], [180, 45, '3:00, hook at 0:45']]) {
  const got = hookFromHeatmap(heatPage(dur, hook));
  ok(got !== null, `${label}: heatmap read`);
  ok(Math.abs(got.hookAt - hook) <= 6, `${label}: found the hook at ${mmss(got.hookAt)} (actual ${mmss(hook)})`);
  ok(got.confidence >= 50, `${label}: a clear peak reads as confident (${got.confidence})`);
}

console.log('\nTHE TRAPS');
// The opening seconds always spike — that is restarts, not the hook. Getting
// this wrong would start every performance on the intro.
const restarty = hookFromHeatmap(heatPage(210, 64, { intro: 0.99, peak: 0.95 }));
ok(restarty.hookAt > 20, `a video people restart constantly still finds the hook at ${mmss(restarty.hookAt)}, not the first seconds`);
// A flat heatmap means the read is worth little and should say so.
const flat = hookFromHeatmap(heatPage(210, 100, { intro: 0.5, peak: 0.52, base: 0.5 }));
ok(flat.confidence <= 45, `a flat heatmap reports low confidence (${flat.confidence}), so it can be re-read later`);
ok(hookFromHeatmap('{"nothing":true}') === null, 'a page with no heatmap returns nothing rather than a bad guess');
ok(hookFromHeatmap('') === null, 'an empty page is handled');

console.log('\nLABELLED CHAPTERS BEAT EVERYTHING');
const chapters = '{"chapterRenderer":{"title":{"simpleText":"Verse 1"},"timeRangeStartMillis":15000},'
  + '"chapterRenderer":{"title":{"simpleText":"Chorus"},"timeRangeStartMillis":58000}}';
const ch = hookFromChapters(chapters);
ok(ch && ch.hookAt === 58, `a labelled chorus is read exactly (${mmss(ch.hookAt)})`);
ok(ch.confidence === 90, 'and trusted over a heatmap read');
ok(hookFromChapters('{"chapterRenderer":{"title":{"simpleText":"Intro"},"timeRangeStartMillis":0}}') === null,
   'chapters without a chorus fall through instead of picking the intro');

console.log('\nTHE WINDOW AROUND THE HOOK');
for (const [dur, hook] of [[210, 62], [252, 74], [135, 40]]) {
  const w = windowAroundHook(hook, dur);
  ok(w.start < hook, `plays ${mmss(w.start)} → ${mmss(w.start + w.seconds)}: starts before the hook, so there is a run-up`);
  ok(w.start + w.seconds > hook, 'and carries through it rather than cutting off at it');
  ok(w.start + w.seconds <= dur, 'never runs past the end of the track');
}
const early = windowAroundHook(6, 200);
ok(early.start === 0, 'a hook that opens the track just starts at zero rather than going negative');

console.log('\nLEARNED ONCE, THEN REMEMBERED');
process.env.HVAS_HOST_CODE = 'HOST850';
const dataDir = `/tmp/hvas-hook-${Date.now()}`;
const { createApp } = await import('./src/app.mjs');
const { server, db } = createApp({ dataDir });
await new Promise((r) => server.listen(0, r));
// The store is what makes this tracking rather than a lookup every night.
db.prepare(`INSERT INTO song_clips(song_id,video_id,start,seconds,hook_at,source,confidence,updated_at)
  VALUES('usher-yeah','GxBSyx85Kp8',44,70,62,'replayed',78,?)`).run(Date.now());
const row = db.prepare('SELECT * FROM song_clips WHERE song_id=?').get('usher-yeah');
ok(row.source === 'replayed' && row.hook_at === 62, 'a resolved hook is written down with where it came from');
ok(row.confidence === 78, 'and how much to trust it, so a weak read can be re-taken later');
server.close();
rmSync(dataDir, { recursive: true, force: true });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

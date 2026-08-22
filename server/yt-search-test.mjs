// The part of the no-quota lookup that can rot without anyone noticing: it
// reads somebody else's HTML, and if they change its shape the resolver would
// quietly stop finding anything. This pins the reading, with no network.
import { videoIdsFrom, looksRight, searchQuery } from './src/yt-search.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

console.log('READING IDS OUT OF THE SEARCH PAGE');
const page = `<!doctype html><script>var ytInitialData = {"contents":{"items":[
  {"videoRenderer":{"videoId":"dQw4w9WgXcQ","title":{"runs":[{"text":"A Song"}]}}},
  {"videoRenderer":{"videoId":"kJQP7kiw5Fk","title":{"runs":[{"text":"Another"}]}}},
  {"videoRenderer":{"videoId":"dQw4w9WgXcQ","title":{"runs":[{"text":"dupe"}]}}}
]}};</script>`;
const ids = videoIdsFrom(page);
ok(ids.length === 2, `two distinct ids found (${ids.length})`);
ok(ids[0] === 'dQw4w9WgXcQ', 'in page order, so the top result comes first');
ok(!ids.includes(''), 'and nothing empty');

console.log('\nAND FAILING HONESTLY WHEN THE PAGE CHANGES');
ok(videoIdsFrom('<html>consent wall, no data here</html>').length === 0, 'a page with no ids yields none, rather than throwing');
ok(videoIdsFrom('').length === 0, 'so does an empty body');
ok(videoIdsFrom(null).length === 0, 'so does nothing at all');
ok(videoIdsFrom('"videoId":"tooshort"').length === 0, 'an id of the wrong length is not accepted');
ok(videoIdsFrom('"videoId":"waytoolongtobeanid11"').length === 0, 'nor is an over-long one');

console.log('\nSPOTTING A MATCH THAT IS PROBABLY WRONG');
ok(looksRight('Lil Jon', 'Get Low', 'Lil Jon & The East Side Boyz - Get Low (Official Video)'), 'the real thing reads right');
ok(looksRight('Beyoncé', 'Cuff It', 'Beyonce - CUFF IT (Official Audio)'), 'accents and case do not matter');
ok(!looksRight('Usher', 'Yeah!', 'Top 100 Party Anthems Mix 2024 - 3 Hours'), 'a random mix does not');
ok(!looksRight('SZA', 'Kill Bill', 'How to play guitar for beginners'), 'nor does something unrelated');
ok(looksRight('Ciara', '1, 2 Step', 'Ciara - 1, 2 Step ft. Missy Elliott'), 'punctuation in a title is not a mismatch');

console.log('\nTHE QUERY ASKS FOR THE RECORD');
ok(/official audio/i.test(searchQuery('Drake', 'Nice For What')), 'it asks for the official audio, not a live cut or an hour-long mix');
ok(searchQuery('Drake', 'Nice For What').startsWith('Drake Nice For What'), 'artist and song lead it');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

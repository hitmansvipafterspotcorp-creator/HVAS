// Pulling a video id out of YouTube's public search page.
//
// Kept apart from the resolver script so it can be tested without a network:
// the script does the fetching, this does the reading, and the reading is the
// part that silently rots when somebody else changes their HTML.
//
// The page ships its state as a big ytInitialData JSON blob. Every result
// carries "videoId":"<11 chars>", in page order, so the first ids out are the
// top results. That is all this needs — the id is then confirmed through
// oEmbed, which says whether the video is real and embeddable.

/** Video ids in page order, deduplicated. Empty array if the page shape is not
 *  what we expect — the caller must treat that as "could not find", never as
 *  "no results", because those need very different messages. */
export function videoIdsFrom(html) {
  const out = [];
  const seen = new Set();
  for (const m of String(html || '').matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g)) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    out.push(m[1]);
  }
  return out;
}

/** A query that finds the record rather than a live version, a lyric video or
 *  an hour-long mix. Not magic — just the words a person would add. */
export const searchQuery = (artist, song) => `${artist} ${song} official audio`;

/** Does this result look like the actual song? Used only to warn, never to
 *  reject: a false negative that drops a correct match is worse than a title
 *  that reads oddly, and the run prints every title for a human to scan. */
export function looksRight(artist, song, title, author = '') {
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const t = norm(title);
  if (!t) return false;
  // The artist is very often NOT in the title — an official upload is called
  // "Family Affair (Radio Edit)" or just "Hey Ya!", because the artist is the
  // channel it is posted on. Checking the title alone flagged four correct
  // matches out of the first ten as doubtful, which is how a warning becomes
  // noise people stop reading. oEmbed gives us the channel, so use both.
  const where = `${t} ${norm(author)}`.trim();
  const words = (s) => norm(s).split(' ').filter((w) => w.length > 2);
  const songWords = words(song);
  const artistWords = words(artist);
  const hitTitle = (ws) => ws.length === 0 || ws.some((w) => t.includes(w));
  const hitEither = (ws) => ws.length === 0 || ws.some((w) => where.includes(w));
  // The song has to be in the TITLE — a channel named after the artist does not
  // tell you which of their records this is. The artist may be in either.
  return hitTitle(songWords) && hitEither(artistWords);
}

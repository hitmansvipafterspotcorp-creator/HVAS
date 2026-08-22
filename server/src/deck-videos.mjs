// GENERATED — written by server/resolve-deck-videos.mjs. Safe to hand-edit if
// a lookup picked the wrong upload; the resolver only fills in ids that are
// missing, so anything already here is left alone.
//
// Why this file exists at all:
//
// Solo vs CPU has no backend. It used to hand the YouTube IFrame player a
// search query — "Cardi B Up" — and let YouTube find the track. That needed no
// API key and no quota, which is why it was built that way. YouTube deprecated
// search in the IFrame Player API in November 2020 and it now returns nothing,
// silently: no error, no callback, just a player that never plays. Solo shipped
// with no sound because of it.
//
// Playing a video BY ID needs no key and no quota either — only *finding* the
// id costs anything, and that happens once, here, on the venue's machine. The
// alternative (every phone searching at play time) would put every player in
// the world on one shared 10,000-unit daily budget, which is 100 searches a day
// for everybody combined.
//
// Keyed by the deck item's `id` from decks.mjs.

export const DECK_VIDEO_IDS = {
};

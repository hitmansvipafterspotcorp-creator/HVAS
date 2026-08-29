// A member's number is the thing they read out at the door when their phone is
// dead, and the thing the roster is sorted by. It has to be unique, and the
// database says so — `number TEXT UNIQUE NOT NULL`.
//
// It used to be picked at random and inserted with no check. 9000 x 9000 is
// 81 million numbers, so a clash is rare — and rare is the problem. It would
// have happened once, to one person, at the door, on a night, and what they
// would have seen is a 500 with a raw SQLite constraint message on it. To them
// and to the person scanning them in, that reads as "the app is down".
//
// Rare failures on the joining path are worse than common ones, not better:
// nobody has seen it before, so nobody knows it is survivable.
export const randomMemberNumber = (rand = Math.random) =>
  `HV-${1000 + Math.floor(rand() * 9000)}-${1000 + Math.floor(rand() * 9000)}`;

// Pick a number nothing else holds. Synchronous from the check to the insert
// that follows it — node:sqlite is synchronous and Node runs one thing at a
// time, so no second signup can slip in between and take it.
//
// The retry also covers the case the check cannot see: a number written by
// another venue device that merged in over the mesh. That one surfaces as a
// constraint error on insert, which is why the caller retries too.
export function freeMemberNumber(db, gen = randomMemberNumber, tries = 200) {
  const taken = db.prepare('SELECT 1 FROM members WHERE number=?');
  for (let i = 0; i < tries; i++) {
    const n = gen();
    if (!taken.get(n)) return n;
  }
  // 200 misses against 81 million numbers is not bad luck, it is a broken
  // generator or a database that has stopped answering. Either way, saying so
  // is worth more than handing back a number that will fail on insert.
  throw new Error('Could not find a free member number');
}

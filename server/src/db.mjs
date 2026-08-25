// HVAS backend — persistence. Zero external deps: Node's built-in SQLite.
// One file DB under server/data. Schema is created on first boot.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDb(path) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      contact TEXT UNIQUE NOT NULL,
      number TEXT UNIQUE NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT 0   -- LWW clock for mesh merge
    );
    CREATE TABLE IF NOT EXISTS memberships (
      member_id TEXT PRIMARY KEY REFERENCES members(id),
      tier TEXT NOT NULL,
      vip INTEGER NOT NULL DEFAULT 0,
      payment TEXT,
      purchased_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',  -- active | suspended
      updated_at INTEGER NOT NULL DEFAULT 0   -- LWW clock for mesh merge
    );
    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id TEXT NOT NULL REFERENCES members(id),
      night TEXT NOT NULL,                    -- 3AM-shifted date key
      at INTEGER NOT NULL,
      by_staff TEXT,
      UNIQUE(member_id, night)                -- one admission per night
    );
    CREATE TABLE IF NOT EXISTS signals (
      member_id TEXT PRIMARY KEY REFERENCES members(id),
      on_the_way INTEGER NOT NULL DEFAULT 0,
      at INTEGER
    );
    CREATE TABLE IF NOT EXISTS otps (
      contact TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS decisions (            -- door audit log
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id TEXT,
      number TEXT,
      status TEXT NOT NULL,                   -- granted | expired | suspended | trespass
      at INTEGER NOT NULL,
      by_staff TEXT
    );
    -- ── member networking (top-down venues) ──
    CREATE TABLE IF NOT EXISTS connections (          -- the networking graph
      a TEXT NOT NULL,                        -- sorted pair (a < b) = one row per pair
      b TEXT NOT NULL,
      status TEXT NOT NULL,                   -- pending | linked
      requested_by TEXT,
      at INTEGER NOT NULL,
      PRIMARY KEY (a, b)
    );
    CREATE TABLE IF NOT EXISTS messages (             -- chat history (converges via mesh)
      id TEXT PRIMARY KEY,                    -- op id (dedup)
      from_id TEXT NOT NULL,
      to_id TEXT,                             -- null = venue-local broadcast
      venue TEXT,
      body TEXT NOT NULL,
      at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_msg_pair ON messages(from_id, to_id, at);
    -- ── HVAS Pay: rail-agnostic membership settlement ledger ──
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      member_id TEXT NOT NULL,
      tier TEXT NOT NULL,
      rail TEXT NOT NULL,                     -- paypal | zelle | cash | other
      amount INTEGER NOT NULL,                -- USD
      reference TEXT,                         -- what the member entered (last4, note, cashtag)
      status TEXT NOT NULL,                   -- pending | paid | void
      at INTEGER NOT NULL,
      confirmed_by TEXT,
      confirmed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_pay_status ON payments(status, at);
    -- ── Lip Sync Bingo: one shared live round, same on every device ──
    CREATE TABLE IF NOT EXISTS bingo_round (
      id INTEGER PRIMARY KEY CHECK (id = 1),  -- singleton: one round at a time
      status TEXT NOT NULL DEFAULT 'lobby',   -- lobby | live | ended
      phrases TEXT NOT NULL DEFAULT '[]',     -- JSON array: this round's master call pool
      calls TEXT NOT NULL DEFAULT '[]',       -- JSON array: called phrases, in call order
      started_at INTEGER,
      winner_member_id TEXT
    );
    CREATE TABLE IF NOT EXISTS bingo_cards (
      member_id TEXT PRIMARY KEY REFERENCES members(id),
      card TEXT NOT NULL,                     -- JSON array of 25 item objects (server-dealt)
      ready INTEGER NOT NULL DEFAULT 0,
      joined_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS bingo_claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id TEXT NOT NULL,
      at INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
      resolved_by TEXT,
      resolved_at INTEGER
    );
    INSERT OR IGNORE INTO bingo_round(id, status, phrases, calls) VALUES (1, 'lobby', '[]', '[]');

    -- ── Party Mode / Battlerz: Team Purple vs Team Pink, audience votes ──
    CREATE TABLE IF NOT EXISTS party_battle (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      round INTEGER NOT NULL DEFAULT 0,       -- increments per battle; scopes votes so they can't carry over
      status TEXT NOT NULL DEFAULT 'idle',    -- idle | battling | ended
      team_a TEXT NOT NULL DEFAULT 'Team Purple',
      team_b TEXT NOT NULL DEFAULT 'Team Pink',
      started_at INTEGER,
      winner TEXT                              -- 'a' | 'b' | null
    );
    CREATE TABLE IF NOT EXISTS party_votes (
      round INTEGER NOT NULL,
      member_id TEXT NOT NULL,
      team TEXT NOT NULL,                      -- 'a' | 'b'
      reaction TEXT,                           -- emoji chip, optional
      at INTEGER NOT NULL,
      PRIMARY KEY (round, member_id)
    );
    INSERT OR IGNORE INTO party_battle(id) VALUES (1);

    -- ── HitKoin: member reward token (mints on real payment confirm) ──
    -- One custodial wallet per member — generated server-side so nobody
    -- needs a seed phrase; the private key is encrypted at rest (seal/open
    -- in crypto.mjs) with a key that never leaves this device.
    CREATE TABLE IF NOT EXISTS wallets (
      member_id TEXT PRIMARY KEY REFERENCES members(id),
      address TEXT NOT NULL UNIQUE,
      enc_privkey TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    -- Local mirror of every mint this venue has ever requested — the source
    -- of truth for display even if the chain call itself later fails
    -- (status stays 'pending'/'failed' so it's visible, never silently lost).
    CREATE TABLE IF NOT EXISTS hitkoin_mints (
      id TEXT PRIMARY KEY,
      member_id TEXT NOT NULL,
      amount_wei TEXT NOT NULL,               -- string: real wei value exceeds JS safe-integer range
      usd_amount REAL NOT NULL,
      reason TEXT NOT NULL,                   -- paypal | zelle | cash | other
      status TEXT NOT NULL DEFAULT 'pending', -- pending | sent | failed
      tx_hash TEXT,
      error TEXT,
      at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_hitkoin_member ON hitkoin_mints(member_id, at);

    -- ── VIP Table Booking: member requests a night + party size, staff decides ──
    CREATE TABLE IF NOT EXISTS table_bookings (
      id TEXT PRIMARY KEY,
      member_id TEXT NOT NULL REFERENCES members(id),
      night TEXT NOT NULL,                    -- YYYY-MM-DD, the night requested
      party_size INTEGER NOT NULL,
      note TEXT,
      status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | declined | cancelled
      table_label TEXT,                       -- staff-assigned on approve, e.g. "VIP Booth 3"
      reason TEXT,                            -- staff note on decline
      decided_by TEXT,
      decided_at INTEGER,
      at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_booking_night ON table_bookings(night, status);
    CREATE INDEX IF NOT EXISTS idx_booking_member ON table_bookings(member_id, at);
  `);
  // Migration: now_playing (YouTube auto-media) added after the table already
  // shipped — ALTER TABLE ADD COLUMN isn't idempotent like CREATE TABLE, so
  // guard it with a column check instead of re-running it every boot.
  const cols = db.prepare(`PRAGMA table_info(bingo_round)`).all().map((c) => c.name);
  if (!cols.includes('now_playing')) {
    db.exec(`ALTER TABLE bingo_round ADD COLUMN now_playing TEXT`); // JSON {videoId,title,at} | null
  }
  if (!cols.includes('deck_id')) {
    db.exec(`ALTER TABLE bingo_round ADD COLUMN deck_id TEXT`); // which BINGO_DECKS key this round deals from
  }
  if (!cols.includes('pattern')) {
    db.exec(`ALTER TABLE bingo_round ADD COLUMN pattern TEXT NOT NULL DEFAULT 'line'`); // line | two_lines | four_corners | x | around_the_world | blackout
  }
  // Three-round game: 1 = any line, 2 = two lines, 3 = full card.
  if (!cols.includes('round_no')) {
    db.exec(`ALTER TABLE bingo_round ADD COLUMN round_no INTEGER NOT NULL DEFAULT 1`);
  }
  // Set when the host picks a one-off pattern instead of playing the rounds.
  if (!cols.includes('custom_pattern')) {
    db.exec(`ALTER TABLE bingo_round ADD COLUMN custom_pattern INTEGER NOT NULL DEFAULT 0`);
  }
  // Winners of each completed round, JSON [{round, memberId, at}].
  if (!cols.includes('round_wins')) {
    db.exec(`ALTER TABLE bingo_round ADD COLUMN round_wins TEXT NOT NULL DEFAULT '[]'`);
  }
  const cardCols = db.prepare(`PRAGMA table_info(bingo_cards)`).all().map((c) => c.name);
  if (!cardCols.includes('covered')) {
    db.exec(`ALTER TABLE bingo_cards ADD COLUMN covered TEXT NOT NULL DEFAULT '[]'`); // JSON array of item ids the player has tapped
  }
  // ── Lip Sync Battles ──
  // A LIP SYNC square can't just be tapped — you have to perform it. When a
  // lip-sync square is called and 2+ players hold it, they battle: perform,
  // get voted on, and only the winner may cover it. Declining forfeits the
  // square for that member, permanently.
  db.exec(`
    CREATE TABLE IF NOT EXISTS lipsync_battles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id TEXT NOT NULL,                  -- the called square being battled for
      artist TEXT, song TEXT,
      status TEXT NOT NULL DEFAULT 'pending', -- pending | performing | voting | done | void
      stage TEXT NOT NULL DEFAULT 'phones',   -- phones | tv  (host decides where it shows)
      started_at INTEGER NOT NULL,
      performing_member_id TEXT,              -- whose turn it is right now
      performance_ends_at INTEGER,
      voting_ends_at INTEGER,
      winner_member_id TEXT,
      resolved_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS lipsync_battle_players (
      battle_id INTEGER NOT NULL REFERENCES lipsync_battles(id),
      member_id TEXT NOT NULL REFERENCES members(id),
      state TEXT NOT NULL DEFAULT 'invited',  -- invited | accepted | declined | performed
      performed_at INTEGER,
      PRIMARY KEY (battle_id, member_id)
    );
    CREATE TABLE IF NOT EXISTS lipsync_battle_votes (
      battle_id INTEGER NOT NULL REFERENCES lipsync_battles(id),
      voter_id TEXT NOT NULL,                 -- one vote per member per battle
      member_id TEXT NOT NULL,                -- who they voted for
      at INTEGER NOT NULL,
      PRIMARY KEY (battle_id, voter_id)
    );
    -- A player's career across every night, kept apart from the live round so
    -- a reset cannot wipe it. This is the reason to come back: the round ends,
    -- the record does not.
    CREATE TABLE IF NOT EXISTS player_stats (
      member_id TEXT PRIMARY KEY REFERENCES members(id),
      nights INTEGER NOT NULL DEFAULT 0,
      rounds_won INTEGER NOT NULL DEFAULT 0,
      seconds INTEGER NOT NULL DEFAULT 0,
      thirds INTEGER NOT NULL DEFAULT 0,
      battles_won INTEGER NOT NULL DEFAULT 0,
      battles_lost INTEGER NOT NULL DEFAULT 0,
      forfeits INTEGER NOT NULL DEFAULT 0,
      squares INTEGER NOT NULL DEFAULT 0,
      performances INTEGER NOT NULL DEFAULT 0,
      last_night TEXT,                        -- the night key of their last round
      streak INTEGER NOT NULL DEFAULT 0,      -- consecutive nights played
      best_streak INTEGER NOT NULL DEFAULT 0
    );
    -- When three or more players hold the same lip sync square, the room
    -- decides which two actually battle for it. One pick per member.
    CREATE TABLE IF NOT EXISTS lipsync_battle_picks (
      battle_id INTEGER NOT NULL REFERENCES lipsync_battles(id),
      voter_id TEXT NOT NULL,
      member_id TEXT NOT NULL,                -- the contender they want to see
      at INTEGER NOT NULL,
      PRIMARY KEY (battle_id, voter_id)
    );
    -- A member who declined (or lost) is barred from covering that square.
    CREATE TABLE IF NOT EXISTS lipsync_locks (
      member_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      reason TEXT NOT NULL,                   -- declined | lost
      at INTEGER NOT NULL,
      PRIMARY KEY (member_id, item_id)
    );
    CREATE INDEX IF NOT EXISTS idx_battle_item ON lipsync_battles(item_id, status);
    -- Live chat + emoji reactions during a battle (the IG-Live layer).
    CREATE TABLE IF NOT EXISTS lipsync_battle_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      battle_id INTEGER NOT NULL,
      member_id TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'comment',  -- comment | reaction
      body TEXT NOT NULL,
      at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_battle_comments ON lipsync_battle_comments(battle_id, at);
    -- Runtime venue settings the host can change without a redeploy or a
    -- restart (e.g. their own YouTube API key).
    -- Where the hook actually is, per song, learned once and kept.
    -- YouTube publishes a replay heatmap on the watch page: the part of a video
    -- people rewind to. On a music video that peak IS the hook — it is the
    -- crowd telling you which 30 seconds matter. We read it once per song,
    -- store the window, and never look it up again.
    CREATE TABLE IF NOT EXISTS song_clips (
      song_id TEXT PRIMARY KEY,               -- the deck item id
      video_id TEXT NOT NULL,                 -- which video the window was measured on
      start INTEGER NOT NULL,                 -- seconds into the video
      seconds INTEGER NOT NULL,               -- how long to play
      hook_at INTEGER,                        -- where the hook itself lands
      source TEXT NOT NULL,                   -- replayed | chapter | estimate | manual
      confidence INTEGER NOT NULL DEFAULT 0,  -- 0-100, so a weak read can be re-tried
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    -- ── Standalone Lip Sync Battle events ──
    -- Bingo battles are owned by a called square. These are the opposite: a
    -- night (or a slot in the night) that is only battles, with its own lobby
    -- and its own standings. The bouts themselves are ordinary rows in
    -- lipsync_battles carrying an event_id, so performing, streaming, crowd
    -- voting and chat are the exact same code paths — only matchmaking differs.
    CREATE TABLE IF NOT EXISTS lipsync_events (
      id INTEGER PRIMARY KEY,
      format TEXT NOT NULL,                   -- bracket | king | open
      title TEXT,
      size INTEGER,                           -- bracket only: 4 | 8 | 16
      status TEXT NOT NULL DEFAULT 'lobby',   -- lobby | live | done
      round INTEGER NOT NULL DEFAULT 0,       -- bracket round, or bout number
      king_member_id TEXT,                    -- king of the hill: who holds the floor
      reign INTEGER NOT NULL DEFAULT 0,       -- how many defences the king has won
      champion_member_id TEXT,
      created_at INTEGER NOT NULL,
      started_at INTEGER, ended_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS lipsync_event_players (
      event_id INTEGER NOT NULL REFERENCES lipsync_events(id),
      member_id TEXT NOT NULL REFERENCES members(id),
      seed INTEGER,                           -- bracket position, set at start
      wins INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      votes_for INTEGER NOT NULL DEFAULT 0,   -- crowd votes across the event
      state TEXT NOT NULL DEFAULT 'in',       -- in | out (knocked out of a bracket)
      out_round INTEGER,
      joined_at INTEGER NOT NULL,
      PRIMARY KEY (event_id, member_id)
    );
  `);

  // player_stats shipped before podium places existed, so any venue already
  // running it has the table WITHOUT these columns — CREATE TABLE IF NOT
  // EXISTS silently leaves an existing table alone, which is exactly how a
  // live database ends up throwing "no such column" on a brand-new feature.
  const pcols = db.prepare(`PRAGMA table_info(player_stats)`).all().map((c) => c.name);
  if (!pcols.includes('seconds')) db.exec(`ALTER TABLE player_stats ADD COLUMN seconds INTEGER NOT NULL DEFAULT 0`);
  if (!pcols.includes('thirds')) db.exec(`ALTER TABLE player_stats ADD COLUMN thirds INTEGER NOT NULL DEFAULT 0`);

  const rcols = db.prepare(`PRAGMA table_info(bingo_round)`).all().map((c) => c.name);
  // Both of these are opt-in, and both default to OFF, because the night runs
  // manually by default: the host calls each song, and a player covers a
  // square by tapping what they hear. Auto is a convenience the host and each
  // player can switch on for themselves, not the house style.
  if (!rcols.includes('auto_call')) {
    db.exec(`ALTER TABLE bingo_round ADD COLUMN auto_call INTEGER NOT NULL DEFAULT 0`);
  }
  const ccols = db.prepare(`PRAGMA table_info(bingo_cards)`).all().map((c) => c.name);
  if (!ccols.includes('autofill')) {
    db.exec(`ALTER TABLE bingo_cards ADD COLUMN autofill INTEGER NOT NULL DEFAULT 0`);
  }
  if (!rcols.includes('podium_ends_at')) {
    // A round no longer stops dead on one winner: the room gets a short sprint
    // to settle second and third.
    db.exec(`ALTER TABLE bingo_round ADD COLUMN podium_ends_at INTEGER`);
  }
  if (!rcols.includes('podium')) {
    db.exec(`ALTER TABLE bingo_round ADD COLUMN podium TEXT NOT NULL DEFAULT '[]'`); // finished standings, top 3
  }
  if (!rcols.includes('podium_first')) {
    db.exec(`ALTER TABLE bingo_round ADD COLUMN podium_first TEXT`);                 // who claimed it
  }
  // ── Money ────────────────────────────────────────────────────────────────
  // A round pays only when a host is running it and at least two members have
  // paid the entry, and the pot is what was actually collected. Both of those
  // need the round to know which kind of night it is, and need the entry to be
  // a recorded fact rather than a number somebody typed into a screen.
  //
  // FREE is the default, deliberately. A round that defaults to cash is a round
  // that claims a pot on the very first night somebody installs this, before a
  // cent has changed hands.
  if (!rcols.includes('mode')) {
    db.exec(`ALTER TABLE bingo_round ADD COLUMN mode TEXT NOT NULL DEFAULT 'free'`);   // free | cash
  }
  if (!ccols.includes('paid')) {
    db.exec(`ALTER TABLE bingo_cards ADD COLUMN paid INTEGER NOT NULL DEFAULT 0`);
  }
  if (!ccols.includes('paid_at')) {
    db.exec(`ALTER TABLE bingo_cards ADD COLUMN paid_at INTEGER`);
  }
  if (!ccols.includes('paid_how')) {
    // How the door took it — cash at the desk, or through the app. The host has
    // to be able to reconcile a pot against what is actually in the till.
    db.exec(`ALTER TABLE bingo_cards ADD COLUMN paid_how TEXT`);
  }

  // Paying the entry from your own phone.
  //
  // A member CLAIMS an entry; a member never grants one. The claim is a request
  // sitting in front of the host — it does not make anybody paid, and the pot
  // does not move until the house confirms it. That ordering is the whole
  // safety property: if a phone could settle its own entry, every pot in the
  // app becomes a number a member typed.
  db.exec(`CREATE TABLE IF NOT EXISTS bingo_entry_claims (
    id TEXT PRIMARY KEY,
    member_id TEXT NOT NULL,
    rail TEXT NOT NULL,              -- paypal | zelle | cashapp | cash
    reference TEXT,                  -- what the member says to look for
    at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',   -- pending | confirmed | rejected
    resolved_by TEXT,
    resolved_at INTEGER
  )`);

  // ── The room's vote on a called lip sync square ──────────────────────────
  // Who voted to make the holder perform, per called square. Kept per round and
  // wiped with it — a vote is about one square in one moment, and carrying it
  // forward would mean a member's old vote forcing somebody months later.
  db.exec(`CREATE TABLE IF NOT EXISTS bingo_mic_votes (
    square_id TEXT NOT NULL,
    member_id TEXT NOT NULL,
    at INTEGER NOT NULL,
    PRIMARY KEY (square_id, member_id)
  )`);

  const bcols = db.prepare(`PRAGMA table_info(lipsync_battles)`).all().map((c) => c.name);
  if (!bcols.includes('pick_ends_at')) {
    // How long the room gets to choose the two battlers, when there are more
    // than two contenders for one square.
    db.exec(`ALTER TABLE lipsync_battles ADD COLUMN pick_ends_at INTEGER`);
  }
  // A bout in a standalone event is still a battle row; these say which event
  // and where in it. Null event_id keeps every existing bingo battle unchanged.
  if (!bcols.includes('event_id')) {
    db.exec(`ALTER TABLE lipsync_battles ADD COLUMN event_id INTEGER`);
    db.exec(`ALTER TABLE lipsync_battles ADD COLUMN round INTEGER`);
    db.exec(`ALTER TABLE lipsync_battles ADD COLUMN slot INTEGER`);
  }
  // A host can hold a running performance — the crowd is loud, someone's mic
  // died — and pick it up where it stopped. Stores what was left on the clock,
  // never a duration the host chose.
  if (!bcols.includes('paused_ms')) {
    db.exec(`ALTER TABLE lipsync_battles ADD COLUMN paused_ms INTEGER`);
  }
  // Indexed after the ALTER, not with the other tables: on a fresh database
  // those columns do not exist until the migration above has run.
  db.exec(`CREATE INDEX IF NOT EXISTS idx_event_bouts ON lipsync_battles(event_id, round)`);

  const entryCols = db.prepare(`PRAGMA table_info(entries)`).all().map((c) => c.name);
  if (!entryCols.includes('left_at')) {
    db.exec(`ALTER TABLE entries ADD COLUMN left_at INTEGER`); // set when the member checks out / leaves — null = still inside
  }
  // Full timestamped timeline: every admit/checkout, including re-entries after
  // a "Left" (entries only holds current state — one row per member+night — so
  // a comeback overwrites it; this is the append-only history behind it).
  db.exec(`
    CREATE TABLE IF NOT EXISTS entry_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id TEXT NOT NULL REFERENCES members(id),
      night TEXT NOT NULL,
      kind TEXT NOT NULL,               -- 'admit' | 'checkout'
      at INTEGER NOT NULL,
      by_staff TEXT,
      searched INTEGER NOT NULL DEFAULT 0  -- staff marked "wanded/searched" at this admit
    );
    CREATE INDEX IF NOT EXISTS idx_entry_events_member_night ON entry_events(member_id, night, at);
  `);
  const eventCols = db.prepare(`PRAGMA table_info(entry_events)`).all().map((c) => c.name);
  if (!eventCols.includes('searched')) {
    db.exec(`ALTER TABLE entry_events ADD COLUMN searched INTEGER NOT NULL DEFAULT 0`);
  }
  // Manual staff flags — trespass/banned/suspended set directly from a
  // member's profile, independent of any door scan. One row per member;
  // clearing it (member.flag with kind=null) deletes the row.
  db.exec(`
    CREATE TABLE IF NOT EXISTS member_flags (
      member_id TEXT PRIMARY KEY REFERENCES members(id),
      kind TEXT NOT NULL,               -- 'banned' | 'trespass' | 'suspended'
      reason TEXT,
      by_staff TEXT,
      at INTEGER NOT NULL
    );
  `);
  return db;
}

// The night boundary is 3AM: shift back 3h, take the date.
export function nightKey(ts = Date.now()) {
  return new Date(ts - 3 * 3600000).toISOString().slice(0, 10);
}

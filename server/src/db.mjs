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
    db.exec(`ALTER TABLE bingo_round ADD COLUMN pattern TEXT NOT NULL DEFAULT 'line'`); // line | four_corners | x | around_the_world | blackout
  }
  const cardCols = db.prepare(`PRAGMA table_info(bingo_cards)`).all().map((c) => c.name);
  if (!cardCols.includes('covered')) {
    db.exec(`ALTER TABLE bingo_cards ADD COLUMN covered TEXT NOT NULL DEFAULT '[]'`); // JSON array of item ids the player has tapped
  }
  const entryCols = db.prepare(`PRAGMA table_info(entries)`).all().map((c) => c.name);
  if (!entryCols.includes('left_at')) {
    db.exec(`ALTER TABLE entries ADD COLUMN left_at INTEGER`); // set when the member checks out / leaves — null = still inside
  }
  return db;
}

// The night boundary is 3AM: shift back 3h, take the date.
export function nightKey(ts = Date.now()) {
  return new Date(ts - 3 * 3600000).toISOString().slice(0, 10);
}

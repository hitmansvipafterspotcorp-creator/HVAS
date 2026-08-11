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
      card TEXT NOT NULL,                     -- JSON array of 25 phrases (server-dealt)
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
  `);
  return db;
}

// The night boundary is 3AM: shift back 3h, take the date.
export function nightKey(ts = Date.now()) {
  return new Date(ts - 3 * 3600000).toISOString().slice(0, 10);
}

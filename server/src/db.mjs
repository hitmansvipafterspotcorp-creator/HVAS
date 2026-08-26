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

  // ── ProofVault (§45) ─────────────────────────────────────────────────────
  // Evidence for both HITKOIN and WORLD, in one place, so the SAPEMS questions
  // in §44 have somewhere to be answered from: what happened, who authorized
  // it, what money was used, was that money restricted, who received value.
  //
  // Append-only by construction — there is no UPDATE and no DELETE anywhere
  // that touches this table. Evidence you can edit is not evidence. A
  // correction is a NEW row that points at the one it corrects.
  db.exec(`CREATE TABLE IF NOT EXISTS proof_vault (
    receipt_id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    member_id TEXT,
    amount_units INTEGER,
    amount_currency TEXT,
    amount_layer TEXT,                 -- FIAT | HITK | WORLD, never merged (§3)
    rail TEXT,
    authorized_by TEXT,                -- §44: who said yes
    restriction_status TEXT,           -- §28: was this somebody else's money
    delivered TEXT,                    -- §44: what the person actually got
    reference TEXT,
    settled INTEGER NOT NULL DEFAULT 0,-- §41: pending is pending until it is not
    at INTEGER NOT NULL,
    meta TEXT NOT NULL DEFAULT '{}',
    proof_hash TEXT NOT NULL
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_proof_member ON proof_vault(member_id, at)`);

  // WORLD reserve contributions (§29). Refusals are stored too: money turned
  // away is something that happened, and Book II's Covenant Test requires that
  // records prove what happened.
  db.exec(`CREATE TABLE IF NOT EXISTS world_contributions (
    contribution_id TEXT PRIMARY KEY,
    source_type TEXT NOT NULL,
    source_entity TEXT,
    source_transaction TEXT,
    amount_units INTEGER NOT NULL,
    currency TEXT NOT NULL,
    asset_type TEXT NOT NULL,
    restriction_status TEXT NOT NULL,
    authorization_id TEXT,
    vault TEXT,
    legal_custodian TEXT,              -- §22: real assets have a lawful keeper
    beneficial_purpose TEXT,
    refused INTEGER NOT NULL DEFAULT 0,
    reason TEXT,
    timestamp INTEGER NOT NULL,
    proof_hash TEXT NOT NULL
  )`);

  // Registered performances (§11, §12: a performance is PERFORMANCE, and the
  // classification decides what proof object is appropriate).
  //
  // The video itself is NOT here and never will be. Takes live on the member's
  // own phone and this app has never uploaded one — that is a deliberate
  // property of a room where people lip sync in a bar. What is registered is
  // the HASH, which is enough to prove later that a given file is the one that
  // was registered, by whom, and when, without anybody surrendering the file.
  //
  // That is the whole trick: provable authorship without custody.
  db.exec(`CREATE TABLE IF NOT EXISTS performance_rights (
    asset_id TEXT PRIMARY KEY,
    member_id TEXT NOT NULL,
    content_hash TEXT NOT NULL,        -- sha256 of the take, computed on the phone
    rights_hash TEXT NOT NULL,         -- hash of the rights statement below
    artist TEXT, song TEXT,
    duration_ms INTEGER,
    venue_night TEXT,
    performed_at INTEGER NOT NULL,
    registered_at INTEGER NOT NULL,
    owner_controller TEXT NOT NULL,    -- who this names as owning the performance
    status TEXT NOT NULL DEFAULT 'registered',
    receipt_id TEXT
  )`);
  // One registration per file per member. Registering the same take twice is
  // the same fact stated twice, not two performances.
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_perf_unique ON performance_rights(member_id, content_hash)`);

  // ── The ways a member makes money here ──────────────────────────────────
  //
  // Licensing covers creative work. It does not cover a chef, a nail tech or a
  // promoter, so there are three more: selling to the room, partnering with the
  // venue, and being paid for who you bring.
  db.exec(`CREATE TABLE IF NOT EXISTS market_listings (
    listing_id TEXT PRIMARY KEY,
    member_id TEXT NOT NULL REFERENCES members(id),
    kind TEXT NOT NULL,                  -- SERVICE | GOODS | FOOD | BOOKING
    title TEXT NOT NULL,
    detail TEXT,
    price_units INTEGER NOT NULL,        -- cents
    price_mode TEXT NOT NULL,            -- FIXED | FROM | HOURLY | PER_HEAD
    delivery TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'OPEN', -- OPEN | PAUSED | CLOSED
    at INTEGER NOT NULL
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_listings_open ON market_listings(status, at DESC)`);
  // The fee is stored ON the order, not looked up later. §46: what was taken is
  // what was disclosed at the time, even if the venue's rate changes tomorrow.
  db.exec(`CREATE TABLE IF NOT EXISTS market_orders (
    order_id TEXT PRIMARY KEY,
    listing_id TEXT NOT NULL,
    seller_id TEXT NOT NULL,
    buyer_id TEXT NOT NULL,
    buyer_name TEXT NOT NULL,
    price_units INTEGER NOT NULL,
    fee_units INTEGER NOT NULL,
    fee_percent REAL NOT NULL,
    seller_units INTEGER NOT NULL,
    note TEXT,
    rail TEXT,
    status TEXT NOT NULL DEFAULT 'PLACED', -- PLACED | PAID | DELIVERED | CANCELLED
    at INTEGER NOT NULL,
    paid_at INTEGER,
    paid_by TEXT,
    delivered_at INTEGER,
    delivered_note TEXT,
    contribution_id TEXT
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_orders_seller ON market_orders(seller_id, at DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_orders_buyer ON market_orders(buyer_id, at DESC)`);

  // A booking is the one thing here where BOTH sides put something down. §18's
  // chain, stage for stage, with the stake as a performance bond rather than
  // yield — the directive is explicit that staking must not be passive
  // speculation, and a no-show is the real failure this marketplace has.
  db.exec(`CREATE TABLE IF NOT EXISTS bookings (
    booking_id TEXT PRIMARY KEY,
    listing_id TEXT,
    provider_id TEXT NOT NULL REFERENCES members(id),
    client_id TEXT NOT NULL REFERENCES members(id),
    title TEXT NOT NULL,
    detail TEXT,
    starts_at INTEGER,
    price_units INTEGER NOT NULL,
    deposit_units INTEGER NOT NULL DEFAULT 0,
    stake_units INTEGER NOT NULL DEFAULT 0,
    stake_layer TEXT NOT NULL DEFAULT 'USD',   -- USD | HITK, see the flag note
    fee_percent REAL NOT NULL,
    stage TEXT NOT NULL DEFAULT 'REQUESTED',
    failure TEXT,                              -- null unless it went wrong
    at INTEGER NOT NULL,
    agreed_at INTEGER,
    secured_at INTEGER,
    secured_by TEXT,
    worked_at INTEGER,
    verified_at INTEGER,
    settled_at INTEGER,
    settled_by TEXT,
    to_provider_units INTEGER,
    to_venue_units INTEGER,
    to_client_units INTEGER,
    stake_returned_units INTEGER,
    stake_forfeited_units INTEGER,
    receipt_id TEXT
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bookings_provider ON bookings(provider_id, at DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bookings_client ON bookings(client_id, at DESC)`);
  // Every move a booking made, and who moved it. A stage that can be rewritten
  // in place is a stage nobody can audit after the night.
  db.exec(`CREATE TABLE IF NOT EXISTS booking_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id TEXT NOT NULL,
    stage TEXT NOT NULL,
    by_id TEXT,
    by_name TEXT,
    at INTEGER NOT NULL,
    note TEXT
  )`);

  db.exec(`CREATE TABLE IF NOT EXISTS partnerships (
    partnership_id TEXT PRIMARY KEY,
    member_id TEXT NOT NULL REFERENCES members(id),
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    terms TEXT,
    house_percent REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'PROPOSED', -- PROPOSED | ACTIVE | DECLINED | ENDED
    proposed_by TEXT NOT NULL,           -- 'house' or 'member' — who opened it
    proposed_at INTEGER NOT NULL,
    member_agreed_at INTEGER,
    house_agreed_at INTEGER,
    house_agreed_by TEXT,
    ended_at INTEGER
  )`);
  // Each night the partnership actually ran, and what each side got.
  db.exec(`CREATE TABLE IF NOT EXISTS partnership_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partnership_id TEXT NOT NULL,
    at INTEGER NOT NULL,
    gross_units INTEGER NOT NULL,
    house_units INTEGER NOT NULL,
    member_units INTEGER NOT NULL,
    house_percent REAL NOT NULL,
    note TEXT,
    recorded_by TEXT NOT NULL
  )`);

  {
    const cols = db.prepare(`PRAGMA table_info(members)`).all().map((c) => c.name);
    // A promoter's code goes on a flyer, so it lives on the member.
    if (!cols.includes('referral_code')) db.exec(`ALTER TABLE members ADD COLUMN referral_code TEXT`);
    // Who brought them. Written ONCE at signup and never rewritten — otherwise
    // a promoter's work can be reassigned after the fact.
    if (!cols.includes('referred_by')) db.exec(`ALTER TABLE members ADD COLUMN referred_by TEXT`);
    if (!cols.includes('referred_at')) db.exec(`ALTER TABLE members ADD COLUMN referred_at INTEGER`);
  }
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_code ON members(referral_code) WHERE referral_code IS NOT NULL`);
  db.exec(`CREATE TABLE IF NOT EXISTS referral_credits (
    credit_id TEXT PRIMARY KEY,
    referrer_id TEXT NOT NULL REFERENCES members(id),
    member_id TEXT NOT NULL REFERENCES members(id),
    event TEXT NOT NULL,                 -- MEMBERSHIP | ENTRY | MARKET
    reference TEXT NOT NULL,             -- the thing that was actually paid
    gross_units INTEGER NOT NULL,
    commission_units INTEGER NOT NULL,
    rate_percent REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'EARNED', -- EARNED | PAID
    at INTEGER NOT NULL,
    paid_at INTEGER,
    paid_by TEXT,
    paid_reference TEXT
  )`);
  // One credit per referrer per paid thing. A membership bought once earns once,
  // however many times the code was mentioned.
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_once ON referral_credits(referrer_id, event, reference)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_credits_referrer ON referral_credits(referrer_id, at DESC)`);

  // ── Licensing ───────────────────────────────────────────────────────────
  //
  // The registry proves who made a thing and when. This is what turns that into
  // something sellable: OFFERS the creator puts up, and GRANTS somebody bought.
  //
  // A licence is a grant of use, not a sale of the work — the creator still owns
  // it afterwards, which is what lets the same recording be licensed for a film,
  // a T-shirt and a remix and still be theirs.
  {
    const cols = db.prepare(`PRAGMA table_info(performance_rights)`).all().map((c) => c.name);
    // The registry started as performances. An app somebody builds is as
    // licensable as a verse somebody sings, so the row carries its kind.
    if (!cols.includes('work_kind')) db.exec(`ALTER TABLE performance_rights ADD COLUMN work_kind TEXT`);
    if (!cols.includes('title')) db.exec(`ALTER TABLE performance_rights ADD COLUMN title TEXT`);
  }
  db.exec(`CREATE TABLE IF NOT EXISTS ip_license_offers (
    offer_id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL REFERENCES performance_rights(asset_id),
    member_id TEXT NOT NULL,             -- the creator; only they may offer
    type TEXT NOT NULL,
    scope TEXT NOT NULL,
    term TEXT NOT NULL,
    exclusive INTEGER NOT NULL DEFAULT 0,
    price_units INTEGER NOT NULL,        -- cents, integer only
    credit INTEGER NOT NULL DEFAULT 1,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'OPEN', -- OPEN | WITHDRAWN
    at INTEGER NOT NULL
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_offers_asset ON ip_license_offers(asset_id, status)`);
  // A grant is a record of something somebody now holds. It is never edited to
  // take it away — an expired licence has a date on it, and a revoked one says
  // who revoked it and why. A grant that could quietly vanish is worth nothing
  // to the person who paid for it.
  db.exec(`CREATE TABLE IF NOT EXISTS ip_license_grants (
    grant_id TEXT PRIMARY KEY,
    offer_id TEXT NOT NULL,
    asset_id TEXT NOT NULL,
    creator_id TEXT NOT NULL,
    buyer_id TEXT,                       -- null when the venue itself licenses
    buyer_name TEXT NOT NULL,
    type TEXT NOT NULL,
    scope TEXT NOT NULL,
    term TEXT NOT NULL,
    exclusive INTEGER NOT NULL DEFAULT 0,
    price_units INTEGER NOT NULL,
    terms_json TEXT NOT NULL,            -- the licence, in full, as agreed
    terms_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING | GRANTED | REFUNDED | REVOKED
    rail TEXT,
    paid_at INTEGER,
    settled_by TEXT,
    at INTEGER NOT NULL,
    starts_at INTEGER,
    expires_at INTEGER,                  -- null = perpetual
    receipt_id TEXT
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_grants_asset ON ip_license_grants(asset_id, status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_grants_buyer ON ip_license_grants(buyer_id, at DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_grants_creator ON ip_license_grants(creator_id, at DESC)`);

  // ── Jubilee (§37, §68) ───────────────────────────────────────────────────
  // A member's need, the approved providers who can be paid for it, and the
  // award that only counts as delivered when the provider says so.
  db.exec(`CREATE TABLE IF NOT EXISTS jubilee_vendors (
    provider_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,                -- landlord | utility | food | lodging | ...
    contact TEXT,
    approved INTEGER NOT NULL DEFAULT 0,
    approved_by TEXT,
    approved_at INTEGER,
    added_at INTEGER NOT NULL
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS jubilee_applications (
    application_id TEXT PRIMARY KEY,
    member_id TEXT NOT NULL,
    need_kind TEXT NOT NULL,
    amount_units INTEGER NOT NULL,
    detail TEXT,                       -- what is happening, in their own words
    provider_hint TEXT,                -- who they say has to be paid
    evidence_note TEXT,                -- what was checked; set by staff, never the member
    evidence_verified INTEGER NOT NULL DEFAULT 0,
    verified_by TEXT, verified_at INTEGER,
    status TEXT NOT NULL DEFAULT 'SUBMITTED',
    at INTEGER NOT NULL
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_jub_member ON jubilee_applications(member_id, at)`);
  db.exec(`CREATE TABLE IF NOT EXISTS jubilee_awards (
    award_id TEXT PRIMARY KEY,
    application_id TEXT NOT NULL,
    member_id TEXT NOT NULL,
    need_kind TEXT NOT NULL,
    program TEXT NOT NULL,
    vault TEXT NOT NULL,
    amount_units INTEGER NOT NULL,
    provider_id TEXT NOT NULL,
    provider_name TEXT NOT NULL,
    emergency INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    paid_at INTEGER, paid_by TEXT, payment_reference TEXT,
    delivered_at INTEGER, delivery_confirmed_by TEXT, delivered TEXT,
    at INTEGER NOT NULL
  )`);
  // Approvals are their own rows so that no single row can be edited to say
  // three people signed off when one did (§55).
  db.exec(`CREATE TABLE IF NOT EXISTS jubilee_approvals (
    award_ref TEXT NOT NULL,           -- the application id; an award is later
    by TEXT NOT NULL,
    at INTEGER NOT NULL,
    emergency INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (award_ref, by)
  )`);

  // ── Which programme a member belongs to ─────────────────────────────────
  //
  // The six programmes already existed as things the RESERVE pays for. Nobody
  // belonged to one, which made them a spending category rather than something
  // a member could point at and say that is mine.
  //
  // Every member joins one. It decides which vault their share of the house fee
  // lands in, so a member can see their own money sitting in a named pot rather
  // than being told a percentage goes somewhere good.
  {
    const cols = db.prepare(`PRAGMA table_info(members)`).all().map((c) => c.name);
    if (!cols.includes('program')) db.exec(`ALTER TABLE members ADD COLUMN program TEXT`);
    if (!cols.includes('program_at')) db.exec(`ALTER TABLE members ADD COLUMN program_at INTEGER`);
  }
  // Switching is allowed and is not quietly overwritten — a member who has
  // moved between programmes has a history, and the reserve's own records point
  // at whichever programme was current when each contribution was made.
  db.exec(`CREATE TABLE IF NOT EXISTS member_program_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id TEXT NOT NULL REFERENCES members(id),
    program TEXT NOT NULL,
    at INTEGER NOT NULL
  )`);

  // ── Being accepted in the first place ───────────────────────────────────
  //
  // Signing in is not membership. Before somebody uses this place they agree to
  // the Community Covenant, say what kind of member they are, and choose a
  // programme to stand behind. The agreement carries the VERSION they saw: when
  // the terms change, what they actually accepted does not silently change with
  // them.
  {
    const cols = db.prepare(`PRAGMA table_info(members)`).all().map((c) => c.name);
    // What they do, from the trade list — and, when they picked OTHER, the words
    // they used. Keeping what somebody typed is how the list grows from the room
    // rather than from us guessing at it.
    if (!cols.includes('member_role')) db.exec(`ALTER TABLE members ADD COLUMN member_role TEXT`);
    if (!cols.includes('role_other')) db.exec(`ALTER TABLE members ADD COLUMN role_other TEXT`);
    if (!cols.includes('accepted_at')) db.exec(`ALTER TABLE members ADD COLUMN accepted_at INTEGER`);
  }
  // Every agreement is its own row, never an update. What somebody signed, and
  // when, is the sort of thing that has to survive somebody changing their mind
  // — and the sort of thing a member is entitled to see for themselves.
  db.exec(`CREATE TABLE IF NOT EXISTS member_agreements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id TEXT NOT NULL REFERENCES members(id),
    document TEXT NOT NULL,              -- COVENANT
    version TEXT NOT NULL,
    at INTEGER NOT NULL,
    device TEXT
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_agreements_member ON member_agreements(member_id, at DESC)`);

  // ── Leaving ──────────────────────────────────────────────────────────────
  //
  // An association somebody cannot leave is not an association. A member who
  // walks away must be able to say so, have it recorded with a date, and stop
  // being admitted — and the record of their membership stays, because it
  // happened. Resigning is not deletion; it is the end of a period that was
  // real and is now over.
  //
  // Kept as its own table rather than a column on members, so that leaving and
  // coming back later is a history rather than one flag being flipped twice.
  db.exec(`CREATE TABLE IF NOT EXISTS member_standing (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id TEXT NOT NULL REFERENCES members(id),
    state TEXT NOT NULL,                 -- RESIGNED | REJOINED | EXPELLED
    reason TEXT,
    at INTEGER NOT NULL,
    by_id TEXT,                          -- the member themselves, or the board
    by_name TEXT
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_standing_member ON member_standing(member_id, at DESC)`);

  // ── Giving to a programme, and sitting on its board ─────────────────────
  //
  // Belonging to a programme is an affiliation, not a payment. Playing bingo is
  // not a donation and must never be recorded as one. There are exactly two
  // ways a member acts on a programme, and both are their own choice:
  //
  //   DONATE — a voluntary amount, to a cause they picked. Like every other
  //   payment in this venue, the member never confirms their own money.
  //
  //   APPLY TO THE BOARD — for a named position, saying what they bring. The
  //   house approves or declines, by name, and a seat is held by one person.
  db.exec(`CREATE TABLE IF NOT EXISTS program_donations (
    donation_id TEXT PRIMARY KEY,
    member_id TEXT NOT NULL REFERENCES members(id),
    program TEXT NOT NULL,
    amount_units INTEGER NOT NULL,       -- cents, integer only
    rail TEXT NOT NULL,                  -- cash | zelle | card
    note TEXT,
    status TEXT NOT NULL DEFAULT 'PLEDGED',  -- PLEDGED | RECEIVED | DECLINED
    at INTEGER NOT NULL,
    settled_at INTEGER,
    settled_by TEXT,
    contribution_id TEXT                 -- the reserve row it became, once received
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS board_seats (
    program TEXT NOT NULL,
    position TEXT NOT NULL,
    member_id TEXT REFERENCES members(id),
    seated_at INTEGER,
    seated_by TEXT,
    PRIMARY KEY (program, position)
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS board_applications (
    application_id TEXT PRIMARY KEY,
    member_id TEXT NOT NULL REFERENCES members(id),
    program TEXT NOT NULL,
    position TEXT NOT NULL,
    brings TEXT NOT NULL,                -- what they bring to the table
    status TEXT NOT NULL DEFAULT 'SUBMITTED',  -- SUBMITTED | APPROVED | DECLINED | WITHDRAWN
    at INTEGER NOT NULL,
    decided_at INTEGER,
    decided_by TEXT,
    decision_note TEXT
  )`);

  // ── Who the staff actually are ───────────────────────────────────────────
  //
  // The venue ran on two shared codes. That is one secret per ROLE, not per
  // person, and it has three consequences that only look small until money
  // moves: every door check and every approval was signed "staff-device";
  // removing one person meant changing the code for everybody; and §55's "no
  // single person releases the reserve" was unsatisfiable, because the venue
  // only had two distinct identities to draw approvers from.
  //
  // A staff account is a name and a role. Nobody types a password and nobody
  // has an email here — the owner adds a person on their own phone, hands them
  // a QR, and that phone is that person from then on.
  db.exec(`CREATE TABLE IF NOT EXISTS staff_accounts (
    staff_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL,                -- staff | host
    created_at INTEGER NOT NULL,
    created_by TEXT,
    last_seen_at INTEGER,
    disabled_at INTEGER,
    disabled_by TEXT,
    -- Exactly one person runs the team, and it is the owner. Running the night
    -- and hiring for it are different jobs: a host brought in for a Saturday
    -- should be able to call the game without also being able to add people to
    -- the payroll or remove the owner from their own venue.
    admin INTEGER NOT NULL DEFAULT 0
  )`);
  {
    const cols = db.prepare(`PRAGMA table_info(staff_accounts)`).all().map((c) => c.name);
    if (!cols.includes('admin')) db.exec(`ALTER TABLE staff_accounts ADD COLUMN admin INTEGER NOT NULL DEFAULT 0`);
  }
  // Two people with the same first name on the same door is a real Saturday,
  // and an approval log that says "Chris" twice is worse than useless.
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_name
           ON staff_accounts(name) WHERE disabled_at IS NULL`);
  // An invite is a single-use, short-lived claim on ONE name. It is not a
  // password: it is spent the moment a phone uses it, so a code read over
  // somebody's shoulder an hour later is worth nothing.
  db.exec(`CREATE TABLE IF NOT EXISTS staff_invites (
    code TEXT PRIMARY KEY,
    staff_id TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    created_by TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at INTEGER,
    used_device TEXT
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

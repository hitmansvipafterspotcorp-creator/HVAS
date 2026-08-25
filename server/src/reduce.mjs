// Materialize mesh ops into the local SQLite view. This is the bridge that
// makes the API and the mesh one system: every op — whether created locally by
// an API call or received from a peer node — runs through here exactly once
// (the mesh dedupes by op id), so all nodes' databases converge.
//
// Runs as background infrastructure on each node; the public app never calls it.
//
// Merge rules mirror the CRDT semantics in mesh.mjs:
//   member.upsert / membership.upsert → last-write-wins by op.ts (updated_at)
//   signal.otw                        → last-write-wins by op.ts
//   entry.admit                       → insert-once (member+night unique)
//   entry.checkout                    → set-once (only while left_at is still null)
//   decision                          → append (deduped by op id upstream)
// Career stats live outside the round so a reset cannot erase them. Every
// update goes through here so the row is created on first sight rather than
// needing a seed step at signup.
function bumpStat(db, memberId, field, by = 1) {
  if (!memberId) return;
  db.prepare('INSERT OR IGNORE INTO player_stats(member_id) VALUES(?)').run(memberId);
  db.prepare(`UPDATE player_stats SET ${field} = ${field} + ? WHERE member_id=?`).run(by, memberId);
}

// A night counts the first time you take a card that night. Playing on
// consecutive nights extends a streak; missing one resets it to this night
// alone. Nights are keyed on a 3am boundary, so a 2am round still belongs to
// the night it started.
function markNight(db, memberId, night) {
  if (!memberId || !night) return;
  db.prepare('INSERT OR IGNORE INTO player_stats(member_id) VALUES(?)').run(memberId);
  const row = db.prepare('SELECT last_night, streak, best_streak FROM player_stats WHERE member_id=?').get(memberId);
  if (row.last_night === night) return;                 // already counted tonight
  const prev = new Date(`${night}T00:00:00Z`);
  prev.setUTCDate(prev.getUTCDate() - 1);
  const consecutive = row.last_night === prev.toISOString().slice(0, 10);
  const streak = consecutive ? (row.streak || 0) + 1 : 1;
  db.prepare(`UPDATE player_stats SET nights = nights + 1, last_night = ?, streak = ?,
    best_streak = MAX(best_streak, ?) WHERE member_id=?`).run(night, streak, streak, memberId);
}

// ── Standalone Lip Sync Battle events ──
// Called when a bout carrying an event_id resolves. Everything here is derived
// from the bout row and the winner, so a replay of the op log rebuilds the same
// standings — no wall-clock or random input.
function advanceEvent(db, bout, winnerId, ts) {
  const ev = db.prepare('SELECT * FROM lipsync_events WHERE id=?').get(bout.event_id);
  if (!ev || ev.status === 'done') return;
  const players = db.prepare('SELECT member_id FROM lipsync_battle_players WHERE battle_id=?').all(bout.id)
    .map((r) => r.member_id);

  // Standings first: win/loss for the pair, plus the crowd votes each drew,
  // which is how the open floor is ranked.
  for (const m of players) {
    const votes = db.prepare('SELECT COUNT(*) n FROM lipsync_battle_votes WHERE battle_id=? AND member_id=?').get(bout.id, m).n;
    db.prepare(`UPDATE lipsync_event_players SET wins=wins+?, losses=losses+?, votes_for=votes_for+?
      WHERE event_id=? AND member_id=?`)
      .run(m === winnerId ? 1 : 0, m === winnerId ? 0 : 1, votes, ev.id, m);
  }

  if (ev.format === 'bracket') {
    // Knockout: the loser is out at this round. When one player is left
    // standing across the whole bracket, they are the champion.
    for (const m of players) {
      if (m === winnerId) continue;
      db.prepare(`UPDATE lipsync_event_players SET state='out', out_round=? WHERE event_id=? AND member_id=?`)
        .run(bout.round, ev.id, m);
    }
    const left = db.prepare(`SELECT member_id FROM lipsync_event_players WHERE event_id=? AND state='in'`).all(ev.id);
    if (left.length === 1) {
      db.prepare(`UPDATE lipsync_events SET status='done', champion_member_id=?, ended_at=? WHERE id=?`)
        .run(left[0].member_id, ts, ev.id);
    }
  } else if (ev.format === 'king') {
    // Whoever wins holds the floor. Holding it through another bout extends the
    // reign; taking it from someone starts a fresh one.
    const held = ev.king_member_id === winnerId;
    db.prepare(`UPDATE lipsync_events SET king_member_id=?, reign=? WHERE id=?`)
      .run(winnerId, held ? ev.reign + 1 : 1, ev.id);
  }
  // Open floor keeps no throne and eliminates nobody — the standings are the
  // whole game, so the rows updated above are all it needs.
}

export function applyOp(db, op) {
  const ts = op.ts;
  const d = op.data;
  switch (op.t) {
    case 'member.upsert':
      db.prepare(`INSERT INTO members(id,name,contact,number,created_at,updated_at)
        VALUES(@id,@name,@contact,@number,@created_at,@ts)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name, contact=excluded.contact,
          number=excluded.number, updated_at=excluded.updated_at
        WHERE excluded.updated_at > members.updated_at`)
        .run({ ...d, ts });
      break;
    case 'membership.upsert':
      db.prepare(`INSERT INTO memberships(member_id,tier,vip,payment,purchased_at,expires_at,status,updated_at)
        VALUES(@member_id,@tier,@vip,@payment,@purchased_at,@expires_at,@status,@ts)
        ON CONFLICT(member_id) DO UPDATE SET tier=excluded.tier, vip=excluded.vip,
          payment=excluded.payment, purchased_at=excluded.purchased_at,
          expires_at=excluded.expires_at, status=excluded.status, updated_at=excluded.updated_at
        WHERE excluded.updated_at > memberships.updated_at`)
        .run({ member_id: d.member_id, tier: d.tier, vip: d.vip ? 1 : 0, payment: d.payment ?? null,
               purchased_at: d.purchased_at, expires_at: d.expires_at, status: d.status || 'active', ts });
      break;
    case 'signal.otw':
      db.prepare(`INSERT INTO signals(member_id,on_the_way,at)
        VALUES(@member_id,@on,@ts)
        ON CONFLICT(member_id) DO UPDATE SET on_the_way=excluded.on_the_way, at=excluded.at
        WHERE excluded.at >= signals.at OR signals.at IS NULL`)
        .run({ member_id: d.member_id, on: d.on ? 1 : 0, ts });
      // log the "heading over" moment into the same timeline as admit/checkout
      // (only the on-flip — toggling off isn't an event worth surfacing to staff)
      if (d.on && d.night) {
        db.prepare('INSERT INTO entry_events(member_id,night,kind,at) VALUES(?,?,\'otw\',?)')
          .run(d.member_id, d.night, ts);
      }
      break;
    // entries holds CURRENT state (one row per member+night); entry_events is
    // the append-only history behind it. A member who left and gets scanned
    // again is a real "back inside" event, not a no-op — re-admitting clears
    // left_at so entries reflects that, and only a state change (first
    // arrival, or a genuine comeback) gets logged, so duplicate scans of an
    // already-inside member don't spam the timeline.
    case 'entry.admit': {
      const existing = db.prepare('SELECT * FROM entries WHERE member_id=? AND night=?').get(d.member_id, d.night);
      let changed = false;
      if (!existing) {
        db.prepare('INSERT INTO entries(member_id,night,at,by_staff) VALUES(?,?,?,?)')
          .run(d.member_id, d.night, d.at, d.by_staff ?? null);
        changed = true;
      } else if (existing.left_at) {
        db.prepare('UPDATE entries SET left_at=NULL WHERE member_id=? AND night=?').run(d.member_id, d.night);
        changed = true;
      }
      if (changed) {
        db.prepare('INSERT INTO entry_events(member_id,night,kind,at,by_staff,searched) VALUES(?,?,\'admit\',?,?,?)')
          .run(d.member_id, d.night, d.at, d.by_staff ?? null, d.searched ? 1 : 0);
      }
      // arriving clears the on-the-way signal (idempotent)
      db.prepare('UPDATE signals SET on_the_way=0 WHERE member_id=?').run(d.member_id);
      break;
    }
    case 'entry.checkout': {                             // member marked "left" for the night — idempotent
      const info = db.prepare('UPDATE entries SET left_at=? WHERE member_id=? AND night=? AND left_at IS NULL')
        .run(d.at ?? ts, d.member_id, d.night);
      if (info.changes > 0) {
        db.prepare('INSERT INTO entry_events(member_id,night,kind,at,by_staff) VALUES(?,?,\'checkout\',?,?)')
          .run(d.member_id, d.night, d.at ?? ts, d.by_staff ?? null);
      }
      break;
    }
    case 'decision':
      db.prepare('INSERT INTO decisions(member_id,number,status,at,by_staff) VALUES(?,?,?,?,?)')
        .run(d.member_id ?? null, d.number ?? null, d.status, d.at, d.by_staff ?? null);
      break;
    // Manual staff flag (ban/trespass/suspend) set from a member's profile —
    // kind:null clears it. Last-write-wins by ts so two staff devices setting
    // conflicting flags converge instead of duplicating rows.
    case 'member.flag':
      if (!d.kind) {
        db.prepare('DELETE FROM member_flags WHERE member_id=?').run(d.member_id);
      } else {
        db.prepare(`INSERT INTO member_flags(member_id,kind,reason,by_staff,at) VALUES(@member_id,@kind,@reason,@by_staff,@ts)
          ON CONFLICT(member_id) DO UPDATE SET kind=excluded.kind, reason=excluded.reason,
            by_staff=excluded.by_staff, at=excluded.at WHERE excluded.at >= member_flags.at`)
          .run({ member_id: d.member_id, kind: d.kind, reason: d.reason ?? null, by_staff: d.by_staff ?? null, ts });
      }
      break;

    // ── networking (top-down venues) ──
    case 'link.request': {                             // one member asks to connect
      const [a, b] = [d.from, d.to].sort();
      db.prepare(`INSERT INTO connections(a,b,status,requested_by,at) VALUES(?,?,'pending',?,?)
        ON CONFLICT(a,b) DO NOTHING`).run(a, b, d.from, ts);
      break;
    }
    case 'link.accept': {                              // the other accepts → linked
      const [a, b] = [d.from, d.to].sort();
      db.prepare(`INSERT INTO connections(a,b,status,requested_by,at) VALUES(?,?,'linked',?,?)
        ON CONFLICT(a,b) DO UPDATE SET status='linked', at=excluded.at`).run(a, b, d.to, ts);
      break;
    }
    case 'chat':                                       // deduped by op id (PRIMARY KEY)
      db.prepare(`INSERT OR IGNORE INTO messages(id,from_id,to_id,venue,body,at)
        VALUES(?,?,?,?,?,?)`).run(op.id, d.from, d.to ?? null, d.venue ?? null, d.body, d.at ?? ts);
      break;

    // ── HVAS Pay ledger ──
    case 'payment.claim':
      db.prepare(`INSERT OR IGNORE INTO payments(id,member_id,tier,rail,amount,reference,status,at)
        VALUES(?,?,?,?,?,?,'pending',?)`).run(d.id, d.member_id, d.tier, d.rail, d.amount, d.reference ?? null, d.at ?? ts);
      break;
    case 'payment.confirm':
      db.prepare(`UPDATE payments SET status='paid', confirmed_by=?, confirmed_at=? WHERE id=? AND status='pending'`)
        .run(d.by ?? null, d.at ?? ts, d.id);
      break;
    case 'payment.void':
      db.prepare(`UPDATE payments SET status='void', confirmed_by=?, confirmed_at=? WHERE id=? AND status='pending'`)
        .run(d.by ?? null, d.at ?? ts, d.id);
      break;

    // ── Lip Sync Bingo: one shared live round ──
    case 'bingo.start':
      db.prepare(`UPDATE bingo_round SET status='live', phrases=?, calls='[]', started_at=?, winner_member_id=NULL WHERE id=1`)
        .run(JSON.stringify(d.phrases), d.at ?? ts);
      break;
    case 'bingo.call':
      db.prepare(`UPDATE bingo_round SET calls=? WHERE id=1`).run(JSON.stringify(d.calls));
      break;
    case 'bingo.join':
      db.prepare(`INSERT OR IGNORE INTO bingo_cards(member_id,card,ready,joined_at) VALUES(?,?,0,?)`)
        .run(d.member_id, JSON.stringify(d.card), d.at ?? ts);
      markNight(db, d.member_id, d.night);
      break;
    case 'bingo.ready':
      db.prepare(`UPDATE bingo_cards SET ready=? WHERE member_id=?`).run(d.ready ? 1 : 0, d.member_id);
      break;
    case 'bingo.claim':
      db.prepare(`INSERT INTO bingo_claims(member_id,at,status) VALUES(?,?,'pending')`).run(d.member_id, d.at ?? ts);
      break;
    // An approved claim wins the CURRENT round. Rounds 1 and 2 advance to the
    // next one (harder pattern, same cards and call history — you keep what
    // you've covered); winning the final round ends the game. A host playing a
    // one-off custom pattern isn't running the round ladder, so that still
    // ends immediately.
    case 'bingo.resolve': {
      db.prepare(`UPDATE bingo_claims SET status=?, resolved_by=?, resolved_at=? WHERE id=?`)
        .run(d.approve ? 'approved' : 'rejected', d.by ?? null, d.at ?? ts, d.claim_id);
      if (!d.approve) break;
      // First place is settled. The round does not advance yet — it opens a
      // short sprint so second and third are decided by how close the rest of
      // the room got, instead of everyone else simply losing at once.
      db.prepare(`UPDATE bingo_round SET status='podium', podium_first=?, podium_ends_at=?, podium='[]' WHERE id=1`)
        .run(d.member_id, d.podium_ends_at ?? null);
      break;
    }
    // The sprint is over. `d.standings` is the finished top three, already
    // ranked by the caller against the round's pattern.
    case 'bingo.podium': {
      const r = db.prepare('SELECT round_no, custom_pattern, round_wins FROM bingo_round WHERE id=1').get();
      const standings = (d.standings || []).slice(0, 3);
      const first = standings[0]?.memberId ?? d.first ?? null;
      // Every place on the podium counts toward a career, not just the win.
      if (standings[0]) bumpStat(db, standings[0].memberId, 'rounds_won');
      if (standings[1]) bumpStat(db, standings[1].memberId, 'seconds');
      if (standings[2]) bumpStat(db, standings[2].memberId, 'thirds');
      const wins = JSON.parse(r?.round_wins || '[]');
      wins.push({ round: r?.round_no ?? 1, memberId: first, at: d.at ?? ts, podium: standings });
      const isLadder = !r?.custom_pattern;
      const nextRound = (r?.round_no ?? 1) + 1;
      if (isLadder && nextRound <= (d.final_round ?? 3)) {
        db.prepare(`UPDATE bingo_round SET status='live', round_no=?, round_wins=?, winner_member_id=NULL,
          podium=?, podium_ends_at=NULL, podium_first=NULL WHERE id=1`)
          .run(nextRound, JSON.stringify(wins), JSON.stringify(standings));
      } else {
        db.prepare(`UPDATE bingo_round SET status='ended', winner_member_id=?, round_wins=?,
          podium=?, podium_ends_at=NULL, podium_first=NULL WHERE id=1`)
          .run(first, JSON.stringify(wins), JSON.stringify(standings));
      }
      break;
    }
    case 'bingo.reset':
      db.prepare(`DELETE FROM bingo_cards`).run();
      db.prepare(`DELETE FROM bingo_claims`).run();
      // Battles and their forfeits belong to the game that spawned them. A
      // reset deals brand new cards, so carrying locks over would bar someone
      // from a square they've never even been offered in this game.
      db.prepare(`DELETE FROM lipsync_battle_votes`).run();
      db.prepare(`DELETE FROM lipsync_battle_picks`).run();
      db.prepare(`DELETE FROM lipsync_battle_players`).run();
      db.prepare(`DELETE FROM lipsync_battles`).run();
      db.prepare(`DELETE FROM lipsync_locks`).run();
      // Entries and votes belong to the game that collected them. Cards are
      // deleted above, which takes `paid` with them; the votes are their own
      // table and have to be cleared explicitly or a member's vote on an old
      // square would still be counted against a brand new one.
      db.prepare(`DELETE FROM bingo_mic_votes`).run();
      db.prepare(`DELETE FROM bingo_entry_claims`).run();
      db.prepare(`UPDATE bingo_round SET status='lobby', phrases='[]', calls='[]', started_at=NULL, winner_member_id=NULL,
        now_playing=NULL, deck_id=?, pattern=?, custom_pattern=?, round_no=1, round_wins='[]',
        podium='[]', podium_ends_at=NULL, podium_first=NULL WHERE id=1`)
        .run(d.deck_id ?? null, d.pattern ?? 'line', d.custom_pattern ? 1 : 0);
      break;
    // Player taps a square to mark it covered — only actually called items
    // count toward a win (checked at claim time), but tapping itself is
    // always allowed so the UI can't desync from a slightly-stale poll.
    // Both opt-in and both default off — see the note in db.mjs.
    case 'bingo.auto':
      db.prepare('UPDATE bingo_round SET auto_call=? WHERE id=1').run(d.on ? 1 : 0);
      break;
    case 'bingo.autofill':
      db.prepare('UPDATE bingo_cards SET autofill=? WHERE member_id=?').run(d.on ? 1 : 0, d.member_id);
      break;
    // ── Money ──────────────────────────────────────────────────────────────
    // Which kind of night this is. Free by default and set by the host, never
    // inferred: a round should not start charging because enough people
    // happened to turn up.
    case 'bingo.mode':
      db.prepare(`UPDATE bingo_round SET mode=? WHERE id=1`).run(d.mode === 'cash' ? 'cash' : 'free');
      break;
    // One member's entry, recorded as a fact. This is the only thing that makes
    // a pot real — everything downstream counts these rows and nothing else.
    case 'bingo.entry':
      db.prepare(`UPDATE bingo_cards SET paid=1, paid_at=?, paid_how=? WHERE member_id=?`)
        .run(d.at ?? ts, d.how || 'cash', d.member_id);
      break;
    // Taking an entry back — a member left before the game, the door refunded
    // them, or the host miskeyed. The pot has to be able to go DOWN, or a
    // mistake at the desk is permanent.
    case 'bingo.entry.void':
      db.prepare(`UPDATE bingo_cards SET paid=0, paid_at=NULL, paid_how=NULL WHERE member_id=?`).run(d.member_id);
      break;
    // Paying the entry from your own phone. A claim is a request, not a
    // payment — nothing about the pot changes here.
    case 'bingo.entry.claim':
      db.prepare(`INSERT OR REPLACE INTO bingo_entry_claims(id, member_id, rail, reference, at, status)
        VALUES(?,?,?,?,?, 'pending')`)
        .run(d.id, d.member_id, d.rail, (d.reference || '').slice(0, 120), d.at ?? ts);
      break;
    case 'bingo.entry.claim.resolve':
      db.prepare(`UPDATE bingo_entry_claims SET status=?, resolved_by=?, resolved_at=? WHERE id=?`)
        .run(d.status, d.by ?? null, d.at ?? ts, d.id);
      break;

    // ── The room's vote on a called lip sync square ────────────────────────
    // Voting twice is still one vote. The primary key does the enforcing rather
    // than a read-then-write, which under two phones voting at once would count
    // the same member twice.
    case 'bingo.micvote':
      db.prepare(`INSERT OR IGNORE INTO bingo_mic_votes(square_id, member_id, at) VALUES(?,?,?)`)
        .run(String(d.square_id), d.member_id, d.at ?? ts);
      break;
    case 'bingo.mark': {
      const row = db.prepare('SELECT covered FROM bingo_cards WHERE member_id=?').get(d.member_id);
      if (!row) break;
      const covered = new Set(JSON.parse(row.covered));
      const had = covered.has(d.item_id);
      if (d.covered) covered.add(d.item_id); else covered.delete(d.item_id);
      db.prepare('UPDATE bingo_cards SET covered=? WHERE member_id=?').run(JSON.stringify([...covered]), d.member_id);
      // Career count only moves forward, and only on a square they did not
      // already hold — un-covering and re-covering is not two squares.
      if (d.covered && !had) bumpStat(db, d.member_id, 'squares');
      break;
    }
    // TV auto-media: host picks (or clears) the video playing on the room's
    // TV Display. d.video is {videoId,title} or null to stop.
    case 'bingo.media':
      db.prepare(`UPDATE bingo_round SET now_playing=? WHERE id=1`)
        .run(d.video ? JSON.stringify({ ...d.video, at: d.at ?? ts }) : null);
      break;

    // ── Lip Sync Battles ──
    case 'battle.open':
      // Two contenders battle straight away. Three or more and the room picks
      // which two first, so the square is not decided by whoever taps fastest.
      db.prepare(`INSERT OR IGNORE INTO lipsync_battles(id,item_id,artist,song,status,stage,started_at,pick_ends_at,event_id,round,slot)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(d.id, d.item_id, d.artist ?? null, d.song ?? null,
          d.status || 'pending', d.stage || 'phones', d.at ?? ts, d.pick_ends_at ?? null,
          d.event_id ?? null, d.round ?? null, d.slot ?? null);
      for (const m of d.members || []) {
        db.prepare(`INSERT OR IGNORE INTO lipsync_battle_players(battle_id,member_id,state) VALUES(?,?,?)`)
          .run(d.id, m, d.status === 'picking' ? 'contender' : 'invited');
      }
      break;
    // One pick per member, changeable until the roster locks.
    case 'battle.pick':
      db.prepare(`INSERT INTO lipsync_battle_picks(battle_id,voter_id,member_id,at) VALUES(?,?,?,?)
        ON CONFLICT(battle_id,voter_id) DO UPDATE SET member_id=excluded.member_id, at=excluded.at`)
        .run(d.battle_id, d.voter_id, d.member_id, d.at ?? ts);
      break;
    // The room has chosen. The picked two are invited to perform or forfeit;
    // everyone else drops out of the battle and cannot cover the square,
    // because they never performed for it.
    case 'battle.lock': {
      const chosen = new Set(d.chosen || []);
      const b = db.prepare('SELECT item_id, event_id FROM lipsync_battles WHERE id=?').get(d.battle_id);
      for (const row of db.prepare('SELECT member_id FROM lipsync_battle_players WHERE battle_id=?').all(d.battle_id)) {
        if (chosen.has(row.member_id)) {
          db.prepare(`UPDATE lipsync_battle_players SET state='invited' WHERE battle_id=? AND member_id=?`)
            .run(d.battle_id, row.member_id);
        } else {
          db.prepare('DELETE FROM lipsync_battle_players WHERE battle_id=? AND member_id=?')
            .run(d.battle_id, row.member_id);
          // A standalone bout has no square behind it, so there is nothing to
          // lock anyone out of — only bingo battles bar a member from an item.
          if (b && !b.event_id) db.prepare(`INSERT OR IGNORE INTO lipsync_locks(member_id,item_id,reason,at) VALUES(?,?,'not_picked',?)`)
            .run(row.member_id, b.item_id, d.at ?? ts);
        }
      }
      db.prepare(`UPDATE lipsync_battles SET status='pending', pick_ends_at=NULL WHERE id=?`).run(d.battle_id);
      break;
    }
    case 'battle.respond': {
      db.prepare(`UPDATE lipsync_battle_players SET state=? WHERE battle_id=? AND member_id=? AND state='invited'`)
        .run(d.accept ? 'accepted' : 'declined', d.battle_id, d.member_id);
      // Declining forfeits the square for good — that's the whole deterrent.
      if (!d.accept) {
        bumpStat(db, d.member_id, 'forfeits');
        const b = db.prepare('SELECT item_id, event_id FROM lipsync_battles WHERE id=?').get(d.battle_id);
        if (b && !b.event_id) db.prepare(`INSERT OR IGNORE INTO lipsync_locks(member_id,item_id,reason,at) VALUES(?,?,'declined',?)`)
          .run(d.member_id, b.item_id, d.at ?? ts);
      }
      break;
    }
    case 'battle.stage':                                  // host moves it to the TV (or back to phones)
      db.prepare(`UPDATE lipsync_battles SET stage=? WHERE id=?`).run(d.stage === 'tv' ? 'tv' : 'phones', d.battle_id);
      break;
    case 'battle.perform':                                // a performer takes the floor
      db.prepare(`UPDATE lipsync_battles SET status='performing', performing_member_id=?, performance_ends_at=? WHERE id=?`)
        .run(d.member_id, d.ends_at ?? null, d.battle_id);
      break;
    // Hold and release the running clock. The remaining time is carried over
    // exactly, so pausing never lengthens or shortens a performance.
    case 'battle.timer': {
      const b = db.prepare('SELECT performance_ends_at, paused_ms FROM lipsync_battles WHERE id=?').get(d.battle_id);
      if (!b) break;
      if (d.action === 'pause' && b.performance_ends_at) {
        const left = Math.max(0, b.performance_ends_at - (d.at ?? ts));
        db.prepare('UPDATE lipsync_battles SET paused_ms=?, performance_ends_at=NULL WHERE id=?').run(left, d.battle_id);
      } else if (d.action === 'resume' && b.paused_ms != null) {
        db.prepare('UPDATE lipsync_battles SET performance_ends_at=?, paused_ms=NULL WHERE id=?')
          .run((d.at ?? ts) + b.paused_ms, d.battle_id);
      }
      break;
    }
    case 'battle.performed':
      db.prepare(`UPDATE lipsync_battle_players SET state='performed', performed_at=? WHERE battle_id=? AND member_id=?`)
        .run(d.at ?? ts, d.battle_id, d.member_id);
      bumpStat(db, d.member_id, 'performances');
      db.prepare(`UPDATE lipsync_battles SET performing_member_id=NULL, performance_ends_at=NULL WHERE id=?`).run(d.battle_id);
      break;
    case 'battle.voting':
      db.prepare(`UPDATE lipsync_battles SET status='voting', voting_ends_at=? WHERE id=?`).run(d.ends_at ?? null, d.battle_id);
      break;
    case 'battle.vote':                                   // one vote per member, changeable while voting is open
      db.prepare(`INSERT INTO lipsync_battle_votes(battle_id,voter_id,member_id,at) VALUES(?,?,?,?)
        ON CONFLICT(battle_id,voter_id) DO UPDATE SET member_id=excluded.member_id, at=excluded.at`)
        .run(d.battle_id, d.voter_id, d.member_id, d.at ?? ts);
      break;
    case 'battle.resolve': {
      db.prepare(`UPDATE lipsync_battles SET status='done', winner_member_id=?, resolved_at=? WHERE id=?`)
        .run(d.winner_id ?? null, d.at ?? ts, d.battle_id);
      const b = db.prepare('SELECT * FROM lipsync_battles WHERE id=?').get(d.battle_id);
      if (!b) break;
      bumpStat(db, d.winner_id, 'battles_won');
      // Everyone in the battle except the winner is locked out of the square.
      for (const row of db.prepare('SELECT member_id FROM lipsync_battle_players WHERE battle_id=?').all(d.battle_id)) {
        if (row.member_id === d.winner_id) continue;
        bumpStat(db, row.member_id, 'battles_lost');
        if (!b.event_id) db.prepare(`INSERT OR IGNORE INTO lipsync_locks(member_id,item_id,reason,at) VALUES(?,?,'lost',?)`)
          .run(row.member_id, b.item_id, d.at ?? ts);
      }
      // A bout inside a standalone event also moves that event's standings on.
      if (b.event_id) advanceEvent(db, b, d.winner_id, d.at ?? ts);
      break;
    }
    case 'battle.say':                                    // live comment or emoji burst
      db.prepare(`INSERT INTO lipsync_battle_comments(battle_id,member_id,kind,body,at) VALUES(?,?,?,?,?)`)
        .run(d.battle_id, d.member_id, d.kind === 'reaction' ? 'reaction' : 'comment', String(d.body).slice(0, 200), d.at ?? ts);
      break;
    case 'battle.void':                                 // nobody accepted — square dies with it
      db.prepare(`UPDATE lipsync_battles SET status='void', resolved_at=? WHERE id=?`).run(d.at ?? ts, d.battle_id);
      break;

    // ── Standalone Lip Sync Battle events ──
    case 'event.create':
      db.prepare(`INSERT OR IGNORE INTO lipsync_events(id,format,title,size,status,created_at) VALUES(?,?,?,?,'lobby',?)`)
        .run(d.id, d.format, d.title ?? null, d.size ?? null, d.at ?? ts);
      break;
    case 'event.join':
      db.prepare(`INSERT OR IGNORE INTO lipsync_event_players(event_id,member_id,joined_at) VALUES(?,?,?)`)
        .run(d.event_id, d.member_id, d.at ?? ts);
      break;
    case 'event.leave':
      // Only while the lobby is open — once it is live, dropping out is a
      // forfeit handled by the bout, not a quiet exit from the roster.
      db.prepare(`DELETE FROM lipsync_event_players WHERE event_id=? AND member_id=?
        AND EXISTS(SELECT 1 FROM lipsync_events e WHERE e.id=? AND e.status='lobby')`)
        .run(d.event_id, d.member_id, d.event_id);
      break;
    case 'event.start':
      db.prepare(`UPDATE lipsync_events SET status='live', round=1, started_at=? WHERE id=? AND status='lobby'`)
        .run(d.at ?? ts, d.id);
      for (const s of d.seeds || []) {
        db.prepare(`UPDATE lipsync_event_players SET seed=? WHERE event_id=? AND member_id=?`)
          .run(s.seed, d.id, s.member_id);
      }
      break;
    case 'event.round':
      db.prepare(`UPDATE lipsync_events SET round=? WHERE id=?`).run(d.round, d.event_id);
      break;
    case 'event.end':
      db.prepare(`UPDATE lipsync_events SET status='done', champion_member_id=COALESCE(?,champion_member_id), ended_at=? WHERE id=?`)
        .run(d.champion_id ?? null, d.at ?? ts, d.event_id);
      break;

    // ── Party Mode / Battlerz: Team Purple vs Team Pink, audience votes ──
    case 'party.start':
      db.prepare(`UPDATE party_battle SET status='battling', round=round+1, started_at=?, winner=NULL WHERE id=1`).run(d.at ?? ts);
      break;
    case 'party.vote': {
      const b = db.prepare('SELECT round FROM party_battle WHERE id=1').get();
      db.prepare(`INSERT INTO party_votes(round,member_id,team,reaction,at) VALUES(?,?,?,?,?)
        ON CONFLICT(round,member_id) DO UPDATE SET team=excluded.team, reaction=excluded.reaction, at=excluded.at`)
        .run(b.round, d.member_id, d.team, d.reaction ?? null, d.at ?? ts);
      break;
    }
    case 'party.end':
      db.prepare(`UPDATE party_battle SET status='ended', winner=? WHERE id=1`).run(d.winner ?? null);
      break;
    case 'party.reset':
      db.prepare(`UPDATE party_battle SET status='idle', winner=NULL, started_at=NULL WHERE id=1`).run();
      break;

    // ── VIP Table Booking: member requests, staff decides ──
    case 'booking.request':
      db.prepare(`INSERT OR IGNORE INTO table_bookings(id,member_id,night,party_size,note,status,at)
        VALUES(?,?,?,?,?,'pending',?)`).run(d.id, d.member_id, d.night, d.party_size, d.note ?? null, d.at ?? ts);
      break;
    case 'booking.decide':
      db.prepare(`UPDATE table_bookings SET status=?, table_label=?, reason=?, decided_by=?, decided_at=?
        WHERE id=? AND status='pending'`)
        .run(d.approve ? 'approved' : 'declined', d.table_label ?? null, d.reason ?? null, d.by ?? null, d.at ?? ts, d.id);
      break;
    case 'booking.cancel':
      db.prepare(`UPDATE table_bookings SET status='cancelled' WHERE id=? AND member_id=? AND status IN ('pending','approved')`)
        .run(d.id, d.member_id);
      break;

    default:
      break;
  }
}

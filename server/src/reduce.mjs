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
      const r = db.prepare('SELECT round_no, custom_pattern, round_wins FROM bingo_round WHERE id=1').get();
      const wins = JSON.parse(r?.round_wins || '[]');
      wins.push({ round: r?.round_no ?? 1, memberId: d.member_id, at: d.at ?? ts });
      const isLadder = !r?.custom_pattern;
      const nextRound = (r?.round_no ?? 1) + 1;
      if (isLadder && nextRound <= (d.final_round ?? 3)) {
        db.prepare(`UPDATE bingo_round SET round_no=?, round_wins=?, winner_member_id=NULL WHERE id=1`)
          .run(nextRound, JSON.stringify(wins));
      } else {
        db.prepare(`UPDATE bingo_round SET status='ended', winner_member_id=?, round_wins=? WHERE id=1`)
          .run(d.member_id, JSON.stringify(wins));
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
      db.prepare(`UPDATE bingo_round SET status='lobby', phrases='[]', calls='[]', started_at=NULL, winner_member_id=NULL,
        now_playing=NULL, deck_id=?, pattern=?, custom_pattern=?, round_no=1, round_wins='[]' WHERE id=1`)
        .run(d.deck_id ?? null, d.pattern ?? 'line', d.custom_pattern ? 1 : 0);
      break;
    // Player taps a square to mark it covered — only actually called items
    // count toward a win (checked at claim time), but tapping itself is
    // always allowed so the UI can't desync from a slightly-stale poll.
    case 'bingo.mark': {
      const row = db.prepare('SELECT covered FROM bingo_cards WHERE member_id=?').get(d.member_id);
      if (!row) break;
      const covered = new Set(JSON.parse(row.covered));
      if (d.covered) covered.add(d.item_id); else covered.delete(d.item_id);
      db.prepare('UPDATE bingo_cards SET covered=? WHERE member_id=?').run(JSON.stringify([...covered]), d.member_id);
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
      db.prepare(`INSERT OR IGNORE INTO lipsync_battles(id,item_id,artist,song,status,stage,started_at,pick_ends_at)
        VALUES(?,?,?,?,?,?,?,?)`).run(d.id, d.item_id, d.artist ?? null, d.song ?? null,
          d.status || 'pending', d.stage || 'phones', d.at ?? ts, d.pick_ends_at ?? null);
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
      const b = db.prepare('SELECT item_id FROM lipsync_battles WHERE id=?').get(d.battle_id);
      for (const row of db.prepare('SELECT member_id FROM lipsync_battle_players WHERE battle_id=?').all(d.battle_id)) {
        if (chosen.has(row.member_id)) {
          db.prepare(`UPDATE lipsync_battle_players SET state='invited' WHERE battle_id=? AND member_id=?`)
            .run(d.battle_id, row.member_id);
        } else {
          db.prepare('DELETE FROM lipsync_battle_players WHERE battle_id=? AND member_id=?')
            .run(d.battle_id, row.member_id);
          if (b) db.prepare(`INSERT OR IGNORE INTO lipsync_locks(member_id,item_id,reason,at) VALUES(?,?,'not_picked',?)`)
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
        const b = db.prepare('SELECT item_id FROM lipsync_battles WHERE id=?').get(d.battle_id);
        if (b) db.prepare(`INSERT OR IGNORE INTO lipsync_locks(member_id,item_id,reason,at) VALUES(?,?,'declined',?)`)
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
    case 'battle.performed':
      db.prepare(`UPDATE lipsync_battle_players SET state='performed', performed_at=? WHERE battle_id=? AND member_id=?`)
        .run(d.at ?? ts, d.battle_id, d.member_id);
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
      const b = db.prepare('SELECT item_id FROM lipsync_battles WHERE id=?').get(d.battle_id);
      if (!b) break;
      // Everyone in the battle except the winner is locked out of the square.
      for (const row of db.prepare('SELECT member_id FROM lipsync_battle_players WHERE battle_id=?').all(d.battle_id)) {
        if (row.member_id === d.winner_id) continue;
        db.prepare(`INSERT OR IGNORE INTO lipsync_locks(member_id,item_id,reason,at) VALUES(?,?,'lost',?)`)
          .run(row.member_id, b.item_id, d.at ?? ts);
      }
      break;
    }
    case 'battle.say':                                    // live comment or emoji burst
      db.prepare(`INSERT INTO lipsync_battle_comments(battle_id,member_id,kind,body,at) VALUES(?,?,?,?,?)`)
        .run(d.battle_id, d.member_id, d.kind === 'reaction' ? 'reaction' : 'comment', String(d.body).slice(0, 200), d.at ?? ts);
      break;
    case 'battle.void':                                 // nobody accepted — square dies with it
      db.prepare(`UPDATE lipsync_battles SET status='void', resolved_at=? WHERE id=?`).run(d.at ?? ts, d.battle_id);
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

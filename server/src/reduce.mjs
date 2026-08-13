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
      break;
    case 'entry.admit':
      db.prepare('INSERT OR IGNORE INTO entries(member_id,night,at,by_staff) VALUES(?,?,?,?)')
        .run(d.member_id, d.night, d.at, d.by_staff ?? null);
      // arriving clears the on-the-way signal (idempotent)
      db.prepare('UPDATE signals SET on_the_way=0 WHERE member_id=?').run(d.member_id);
      break;
    case 'decision':
      db.prepare('INSERT INTO decisions(member_id,number,status,at,by_staff) VALUES(?,?,?,?,?)')
        .run(d.member_id ?? null, d.number ?? null, d.status, d.at, d.by_staff ?? null);
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
    case 'bingo.resolve':
      db.prepare(`UPDATE bingo_claims SET status=?, resolved_by=?, resolved_at=? WHERE id=?`)
        .run(d.approve ? 'approved' : 'rejected', d.by ?? null, d.at ?? ts, d.claim_id);
      if (d.approve) {
        db.prepare(`UPDATE bingo_round SET status='ended', winner_member_id=? WHERE id=1`).run(d.member_id);
      }
      break;
    case 'bingo.reset':
      db.prepare(`DELETE FROM bingo_cards`).run();
      db.prepare(`DELETE FROM bingo_claims`).run();
      db.prepare(`UPDATE bingo_round SET status='lobby', phrases='[]', calls='[]', started_at=NULL, winner_member_id=NULL, now_playing=NULL, deck_id=?, pattern=? WHERE id=1`)
        .run(d.deck_id ?? null, d.pattern ?? 'line');
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

    default:
      break;
  }
}

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
    default:
      break;
  }
}

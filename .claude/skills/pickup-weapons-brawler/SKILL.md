---
name: Pickup Weapons Brawler
description: Add pickup weapons to Phaser brawlers: bat pickup, swing arcs, hit validation, durability, throw, drop, and recovery.
---

## Mission
Use this skill when adding weapons such as bats, bottles, signs, chairs, or pipes to the brawler. Weapons must plug into the same depth-gated combat system as fists and supers.

## Required Weapon States
```text
world_idle -> can_pickup -> held -> windup -> active_hit -> recovery -> held
held -> dropped
held -> thrown -> world_idle/broken
active_hit -> durability_loss -> broken/drop
```

## Bat Weapon Defaults
```ts
export const BatWeapon = {
  id: "bat",
  damage: 18,
  durability: 8,
  hit: { forward: 78, back: 8, depth: 18, vertical: 32 },
  windupMs: 90,
  activeMs: 80,
  recoveryMs: 160,
  knockback: { x: 160, y: 0 },
};
```

## Implementation Procedure
1. Add `PickupWeapon` entity with floor anchor.
2. Add interact pickup check using depth and distance.
3. Attach weapon to player hand or placeholder socket.
4. On attack, use weapon hit spec instead of fist hit spec.
5. Reduce durability on confirmed hit or blocked heavy impact.
6. Drop or break when durability reaches zero.
7. Let enemies also carry weapons if requested.

## Debug Requirements
- Show pickup radius.
- Show weapon owner.
- Show weapon active hitbox.
- Show durability in HUD.

## Acceptance Criteria
- Player can pick up bat.
- Player can swing and hit enemy.
- Bat hit uses depth gate.
- Bat drops or breaks after durability runs out.
- Player returns to normal combo set after dropping weapon.

## Security and API Rules
- Never hardcode API keys, tokens, passwords, private URLs, wallet secrets, or credentials into generated code.
- Use environment variables such as `FAL_KEY` or `.env.local` placeholders only.
- Before writing files, inspect the project tree and preserve existing user assets.
- Keep generated code deterministic, testable, and reversible.
- Ask for approval before deleting, overwriting, or mass-renaming production assets.

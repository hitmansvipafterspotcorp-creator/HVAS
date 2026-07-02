---
name: 2.5D Depth Gate Combat
description: Use floor-projected 2.5D hit validation so back-row enemies miss and front-row brawler hits feel fair.
---

## Mission
Use this skill whenever a side-scrolling brawler needs Streets-of-Rage-style 2.5D combat. Every hit must be projected onto the floor plane so enemies in the wrong depth row miss even if their sprites overlap visually.

## Core Rule
Sprites are visual. Combat happens on the floor.

A hit connects only when:
1. The attacker is facing the target or the attack is omnidirectional.
2. The target is inside the horizontal hit arc.
3. The target’s `floorY` is within the allowed depth band.
4. The attacker and target are both in valid combat states.

## Drop-In TypeScript Depth Gate
Use this as the first implementation. It is intentionally small enough to audit.

```ts
export type FighterLike = {
  x: number;
  y: number;
  floorY?: number;
  facing: -1 | 1;
  state: string;
  invulnerable?: boolean;
};

export type HitSpec = {
  forward: number;
  back: number;
  vertical: number;
  depth: number;
  omni?: boolean;
};

export function depthGateHit(
  attacker: FighterLike,
  target: FighterLike,
  hit: HitSpec
): boolean {
  if (target.invulnerable) return false;
  if (target.state === "ko" || attacker.state === "ko") return false;

  const ax = attacker.x;
  const tx = target.x;
  const ay = attacker.floorY ?? attacker.y;
  const ty = target.floorY ?? target.y;

  const dx = tx - ax;
  const dy = Math.abs(ty - ay);

  if (dy > hit.depth) return false;
  if (!hit.omni && Math.sign(dx || attacker.facing) !== attacker.facing) return false;

  const forwardDist = Math.abs(dx);
  const behindDist = Math.abs(dx);
  if (hit.omni) return forwardDist <= hit.forward && dy <= hit.depth;
  if (dx * attacker.facing >= 0) return forwardDist <= hit.forward;
  return behindDist <= hit.back;
}
```

## Debug Overlay Requirements
When debugging, draw:
- Attacker floor dot
- Target floor dot
- Depth band rectangle
- Forward hit span
- A green line on confirmed hit
- A red line on depth miss

## Common Bugs This Prevents
- Back-row enemies getting hit because their tall sprite overlaps the punch.
- Front-row punches missing because body art moved but floor anchor did not.
- Backward kicks connecting from the wrong side.
- Boss sprites with huge torsos getting unfair phantom hits.

## Acceptance Criteria
- An enemy behind the player’s depth lane does not get hit.
- A visually overlapping enemy still misses if its floor dot is outside the depth band.
- A boss can have a huge sprite while its hurtbox remains fair.
- Debug overlay makes the miss reason obvious.

## Security and API Rules
- Never hardcode API keys, tokens, passwords, private URLs, wallet secrets, or credentials into generated code.
- Use environment variables such as `FAL_KEY` or `.env.local` placeholders only.
- Before writing files, inspect the project tree and preserve existing user assets.
- Keep generated code deterministic, testable, and reversible.
- Ask for approval before deleting, overwriting, or mass-renaming production assets.

import { LANE_TOLERANCE } from '../config';
import type { Fighter } from '../entities/Fighter';

// ── DepthGateSystem ─────────────────────────────────────────────────────────
// The single rule that makes a 2.5D brawler feel right: an attack only connects
// when BOTH axes overlap on the floor —
//   1. X overlap: the attack's horizontal reach covers the target's footprint.
//   2. Depth overlap: attacker and target feet-y are within LANE_TOLERANCE.
// A back-row enemy (different feet-y) is missed even if it lines up
// horizontally. This is intentionally tiny and pure so it can be unit-tested
// and reasoned about.
export const DepthGateSystem = {
  // Returns true if `attacker`'s current attack reach lands on `target`.
  connects(attacker: Fighter, target: Fighter): boolean {
    if (!attacker.attackActive) return false;
    if (!target.alive) return false;
    if (target.invuln > 0) return false;

    const reach = attacker.attackReach();
    const hurt = target.hurtSpan();

    // Depth gate: feet lanes must be close enough.
    if (Math.abs(reach.laneY - hurt.laneY) > LANE_TOLERANCE) return false;

    // X overlap test on the floor projection.
    const xOverlap = reach.x1 <= hurt.x2 && reach.x2 >= hurt.x1;
    return xOverlap;
  },

  // Same depth check without requiring an active attack — used by AI to know
  // when it is "in lane" to start an attack.
  sameLane(a: Fighter, b: Fighter): boolean {
    return Math.abs(a.feetY - b.feetY) <= LANE_TOLERANCE;
  },
};

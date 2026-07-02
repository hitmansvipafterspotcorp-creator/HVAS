---
name: Crowd Control Flocking
description: Control brawler enemy pressure with flocking, spacing, rush tokens, queueing, and only-one-rusher rules.
---

## Mission
Use this skill when too many enemies rush the player at once. The crowd should feel alive but fair: enemies surround, posture, reposition, and wait for openings while only one attacker commits at a time unless the wave data says otherwise.

## Core System
Use a `RushToken`. Only the enemy holding the token may enter `approach_attack` or `attack` state. Other enemies use `circle`, `feint`, `idle`, `reposition`, or `throw_projectile` if configured.

## Enemy Group Rules
```text
- One active melee rusher by default.
- One backup enemy may enter telegraph state after the rusher recovers.
- Ranged enemies do not need the melee rush token but must respect cooldowns.
- Heavy enemies reserve more space.
- KO enemies release tokens immediately.
```

## Slotting
Create slots around the player on the floor plane:
```text
front_close
front_far
back_close
back_far
upper_depth
lower_depth
ranged_left
ranged_right
```

Enemies choose slots based on weight, current wave pressure, distance, and whether the player is cornered.

## Simple Separation Rule
```ts
function separationForce(self, others) {
  let fx = 0, fy = 0;
  for (const other of others) {
    if (other === self || other.state === "ko") continue;
    const dx = self.x - other.x;
    const dy = (self.floorY ?? self.y) - (other.floorY ?? other.y);
    const d2 = dx * dx + dy * dy;
    if (d2 > 0 && d2 < 3600) {
      fx += dx / d2;
      fy += dy / d2;
    }
  }
  return { x: fx * 1200, y: fy * 900 };
}
```

## Acceptance Criteria
- Only one melee enemy rushes by default.
- Other enemies reposition instead of stacking inside each other.
- Player can read incoming danger.
- Crowd gets more aggressive by wave config, not by accidental pileup.

## Security and API Rules
- Never hardcode API keys, tokens, passwords, private URLs, wallet secrets, or credentials into generated code.
- Use environment variables such as `FAL_KEY` or `.env.local` placeholders only.
- Before writing files, inspect the project tree and preserve existing user assets.
- Keep generated code deterministic, testable, and reversible.
- Ask for approval before deleting, overwriting, or mass-renaming production assets.

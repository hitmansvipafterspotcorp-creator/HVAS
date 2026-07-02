---
name: Enemy AI Two-Way Combat
description: Build brawler enemy AI with approach, attacks, hurt, KO, wave locks, boss states, and fair two-way combat.
---

## Mission
Use this skill when building enemies that fight back. Enemies must not just walk into the player. They need readable approach, telegraph, attack, recovery, hurt, KO, and wave behavior.

## Enemy State Machine
```text
spawn -> idle -> choose_slot -> approach -> telegraph -> attack -> recover -> idle
                             ↘ hurt -> knockdown -> recover -> idle
                             ↘ ko
```

## Combat Fairness Rules
- Enemy attacks use the same 2.5D depth gate as player attacks.
- Enemies must telegraph before heavy attacks.
- Only one enemy should rush at a time unless the stage explicitly says “swarm.”
- Enemy attacks must have recovery windows.
- KO enemies no longer block movement or receive rush tokens.

## Required Enemy Data
```ts
export type EnemyConfig = {
  id: string;
  hp: number;
  speed: number;
  attackRangeX: number;
  attackDepth: number;
  damage: number;
  poise: number;
  bravery: number;
  cooldownMs: number;
  weightClass: "light" | "medium" | "heavy" | "boss";
};
```

## Wave Director Rules
- Spawn enemies outside or near screen edges.
- Lock camera when the wave begins.
- Unlock camera only when required KOs are complete.
- Do not spawn so many enemies that the player loses readability.
- Use the crowd-control skill to limit rushers.

## Boss Combat Rules
- Bosses get phases, not random cheating.
- Each phase changes one or two variables: speed, attack set, minions, arena hazard, armor, or super meter.
- Boss supers require windup, screen cue, and safe counterplay.

## Acceptance Criteria
- Enemy can damage player.
- Player can interrupt or punish enemy recovery.
- KO state is visible and stable.
- Wave lock/unlock works.
- Enemy pressure feels dangerous but not unfair.

## Security and API Rules
- Never hardcode API keys, tokens, passwords, private URLs, wallet secrets, or credentials into generated code.
- Use environment variables such as `FAL_KEY` or `.env.local` placeholders only.
- Before writing files, inspect the project tree and preserve existing user assets.
- Keep generated code deterministic, testable, and reversible.
- Ask for approval before deleting, overwriting, or mass-renaming production assets.

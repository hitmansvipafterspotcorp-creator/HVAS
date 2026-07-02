---
name: Juice VFX Props Drops
description: Add brawler juice: hit-stop, impact VFX, screen shake, destructible props, pickups, hearts, and satisfying feedback.
---

## Mission
Use this skill when the playable brawler works but feels flat. Add juice carefully: hit-stop, camera shake, impact sparks, dust pops, prop breaks, audio cues, and heart drops without hiding gameplay clarity.

## Juice Stack
```text
confirmed hit -> freeze 50-90ms -> impact spark -> enemy flash -> knockback -> camera bump -> sound cue
prop break -> debris burst -> pickup roll/bounce -> heart idle bob
super hit -> longer hit-stop -> screen flash -> layered VFX -> bass hit -> slow recovery
```

## Hit-Stop Rules
- Light hit: 40-55ms
- Heavy hit: 60-85ms
- Super hit: 90-140ms
- Never freeze UI, timers, or async loading.
- VFX may animate during hit-stop if the design calls for it.

## Destructible Prop Contract
```ts
export type DestructiblePropConfig = {
  id: string;
  hp: number;
  hurtbox: { x: number; y: number; w: number; h: number; depth: number };
  drops: Array<{ id: "heart" | "coin" | "weapon"; chance: number }>;
  breakVfx: string;
};
```

## Heart Drop Rules
- Heart pops out with small arc.
- Heart lands on floor and bobs.
- Player collects with depth/distance check.
- Heal amount is visible in HUD.

## Acceptance Criteria
- Hits feel stronger without breaking timing.
- Prop can be destroyed.
- Prop drops at least one pickup type.
- VFX are readable and do not cover the player for too long.
- Juice intensity scales by hit level.

## Security and API Rules
- Never hardcode API keys, tokens, passwords, private URLs, wallet secrets, or credentials into generated code.
- Use environment variables such as `FAL_KEY` or `.env.local` placeholders only.
- Before writing files, inspect the project tree and preserve existing user assets.
- Keep generated code deterministic, testable, and reversible.
- Ask for approval before deleting, overwriting, or mass-renaming production assets.

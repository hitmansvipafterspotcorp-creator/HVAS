---
name: Boss Garage Door Reveal
description: Create boss fights with camera lock, garage-door cutscene reveal, phase start, music sting, and wave-to-boss transition.
---

## Mission
Use this skill when creating a boss reveal where the player enters an arena, the camera locks, a garage door opens, the boss steps out, the fight title appears, and combat starts.

## Sequence
```text
1. Player crosses boss_trigger hotspot.
2. Input soft-locks except skip/debug.
3. Camera pans or snaps to arena lock zone.
4. Music ducks and door rumble starts.
5. Garage door shakes.
6. Door opens in 3-5 chunks or frames.
7. Smoke/dust VFX spawns at floor.
8. Boss silhouette appears.
9. Boss walks forward to floor anchor.
10. Title card appears.
11. Player regains control.
12. Boss phase 1 starts.
```

## Stage JSON Boss Trigger Example
```json
{
  "type": "boss_trigger",
  "id": "garage_kt_reveal",
  "x": 1840,
  "y": 0,
  "w": 120,
  "h": 720,
  "bossId": "kt_owner_boss",
  "doorId": "garage_door_01",
  "arenaLock": { "x": 1480, "y": 0, "w": 900, "h": 720 }
}
```

## Implementation Rules
- Cutscene must be skippable in debug builds.
- Boss should not become damageable until title card ends.
- Camera lock stays until boss KO.
- Boss intro does not permanently disable player input if interrupted by scene reload.
- Store cutscene state so it does not replay after boss defeat unless reset.

## Acceptance Criteria
- Door reveal plays once.
- Boss appears on correct floor depth.
- Fight starts cleanly after intro.
- KO unlocks camera and opens next route.

## Security and API Rules
- Never hardcode API keys, tokens, passwords, private URLs, wallet secrets, or credentials into generated code.
- Use environment variables such as `FAL_KEY` or `.env.local` placeholders only.
- Before writing files, inspect the project tree and preserve existing user assets.
- Keep generated code deterministic, testable, and reversible.
- Ask for approval before deleting, overwriting, or mass-renaming production assets.

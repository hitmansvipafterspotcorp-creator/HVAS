---
name: Phaser 4.1.0 Brawler Core
description: Build playable Phaser 4.1 TypeScript brawlers: movement, combos, hits, enemies, waves, and JSON stages before art.
---

## Mission
Use this skill when the user wants a playable Phaser 4.1.0 + TypeScript side-scrolling brawler before final art. The goal is to ship a working feel-first prototype: movement, jump/step, dodge/block, combos, hits, knockback, enemy AI, KO states, waves, camera locks, and JSON-authored stages.

## Non-Negotiable Build Order
1. Build the playable greybox first.
2. Implement input, movement, camera, combat, enemies, and waves before any art polishing.
3. Add placeholder capsules/boxes with labels if sprite sheets are missing.
4. Only after the prototype feels good, wire final sprite sheets and animation frames.

## Required Stack
- Engine: Phaser `4.1.0`
- Language: TypeScript
- Runtime: Vite or equivalent browser build
- Data: JSON stage files and JSON animation manifests
- Art path: imported sprite sheets, AI-generated sheets, or placeholder debug bodies

## Default Project Structure
```text
src/
  main.ts
  scenes/BootScene.ts
  scenes/PreloadScene.ts
  scenes/BrawlerScene.ts
  scenes/TopDownVenueScene.ts
  systems/InputBuffer.ts
  systems/CombatSystem.ts
  systems/DepthGate.ts
  systems/WaveDirector.ts
  systems/CrowdControl.ts
  systems/CameraLock.ts
  systems/HitStop.ts
  entities/Player.ts
  entities/Enemy.ts
  entities/Boss.ts
  entities/PickupWeapon.ts
  entities/DestructibleProp.ts
  data/types.ts
public/data/stages/
public/assets/
```

## Implementation Procedure
1. Inspect `package.json`. If missing, scaffold Vite + TypeScript.
2. Pin Phaser to `4.1.0` unless the user explicitly asks for another version.
3. Create a single playable `BrawlerScene` with keyboard controls.
4. Implement these modules in order:
   - `InputBuffer`: records recent inputs for combos.
   - `CombatSystem`: hitboxes, hurtboxes, hit-confirm, knockback.
   - `DepthGate`: 2.5D floor-projected hit validation.
   - `Enemy`: approach, idle, attack, hurt, KO.
   - `WaveDirector`: camera-locked enemy waves.
   - `CrowdControl`: only one enemy rushes at once.
5. Add a debug HUD showing current state, combo, wave, HP, enemy count, and current stage id.
6. Add `npm run dev`, `npm run build`, and `npm run typecheck` scripts.

## Controls Contract
```text
Move: A/D or Left/Right
Depth step: W/S or Up/Down
Attack: J
Special/Super: K
Dodge/Block: L
Interact/Pickup: E or Enter
Debug next stage: ]
Debug previous stage: [
```

## Combat Acceptance Criteria
- Player can move left/right and step up/down on the 2.5D floor.
- Attacks only hit if the target is in horizontal range and close enough in floor depth.
- Three-hit combo works through input buffering.
- Hit-stop triggers on confirmed hits.
- Enemy can approach, attack, get hurt, and enter KO state.
- Camera locks during a wave and unlocks after the wave is cleared.
- At least one destructible prop can drop a heart.

## Code Style Rules
- Use small classes or functions; avoid giant scene files.
- Separate gameplay data from code.
- Use `readonly` config objects for frame data, hitboxes, damage, and timing.
- Keep debug overlays toggleable.
- Never block progress because final sprites are not ready.

## Example User Prompts That Trigger This Skill
- “Build the playable brawler first.”
- “Make the Phaser 4.1.0 engine.”
- “Add movement, combos, hits, enemies, and waves.”
- “Do not make art yet. Make it play.”

## Security and API Rules
- Never hardcode API keys, tokens, passwords, private URLs, wallet secrets, or credentials into generated code.
- Use environment variables such as `FAL_KEY` or `.env.local` placeholders only.
- Before writing files, inspect the project tree and preserve existing user assets.
- Keep generated code deterministic, testable, and reversible.
- Ask for approval before deleting, overwriting, or mass-renaming production assets.

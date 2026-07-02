---
name: One Design Full Animation Set
description: Turn one approved character design into a complete on-model brawler animation set using anchors and video refs.
---

## Mission
Use this skill when the user has one approved character design and wants a full animation set without hand-drawing every frame. The workflow uses one design as the model anchor, generates controlled motion clips, extracts frames, fixes root alignment, and ships Phaser-ready sprite sheets.

## Required Animation Set
Minimum playable set:
```text
idle
walk
run
dodge
block
interact
jab
combo_1
combo_2
combo_3
special
super_1
super_2
super_3
hurt_light
hurt_heavy
knockdown
recover
ko
top_down_idle_down
top_down_walk_down
top_down_walk_up
top_down_walk_left
top_down_walk_right
```

## Production Workflow
1. Validate the source design.
2. Create a neutral anchor with feet on a floor line.
3. Create side-view and top-down-style anchors if needed.
4. Generate motion clips one action at a time.
5. Extract frames.
6. Clean frames: remove off-model frames, duplicate missing frames, fix root drift.
7. Build sprite sheets with consistent frame size.
8. Generate `animations.json` for Phaser.
9. Create a proof contact sheet for approval.

## Sprite Sheet Rules
- 8 frames per row unless the action requires more.
- Keep the same canvas size per character category.
- Put the floor anchor in the same pixel position across all side-view frames.
- For top-down, keep the center/body anchor stable.
- Use transparent PNG where possible.

## Animation Manifest Shape
```json
{
  "characterId": "creator",
  "frameWidth": 256,
  "frameHeight": 256,
  "animations": {
    "idle": { "sheet": "idle.png", "fps": 8, "loop": true, "root": [128, 220] },
    "combo_1": { "sheet": "combo_1.png", "fps": 14, "loop": false, "events": [{ "frame": 3, "type": "hit" }] }
  }
}
```

## Proof Sheet Must Show
- Character name
- Action name
- Frame numbers
- Root anchor line
- Bad-frame notes
- Ready/needs-fix status

## Acceptance Criteria
- One design becomes a complete playable animation set.
- Character stays on model across the entire set.
- Phaser can load the generated manifest without manual edits.
- Bad AI frames are documented, not hidden.

## Security and API Rules
- Never hardcode API keys, tokens, passwords, private URLs, wallet secrets, or credentials into generated code.
- Use environment variables such as `FAL_KEY` or `.env.local` placeholders only.
- Before writing files, inspect the project tree and preserve existing user assets.
- Keep generated code deterministic, testable, and reversible.
- Ask for approval before deleting, overwriting, or mass-renaming production assets.

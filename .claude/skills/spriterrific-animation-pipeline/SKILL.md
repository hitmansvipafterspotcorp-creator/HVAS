---
name: Spriterrific Animation Pipeline
description: Use Spriterrific-style one-design anchoring to produce full sprite sheets through AI motion refs and cleanup.
---

## Mission
Use this skill when the user says Spriterrific, one design to full animation, anchor-based sprite generation, or AI animation set creation. The goal is to keep characters on-model while accelerating animation with image-to-video and cleanup.

## Pipeline
```text
approved design -> anchor image -> pose/action prompt -> AI motion clip -> frame extraction -> bad-frame removal -> root stabilization -> sprite sheet -> animation manifest -> proof sheet
```

## Anchor Rules
- One locked design per character.
- Use the same face, outfit, shoes, body proportions, palette, and emblem across all outputs.
- Feet must be visible and aligned to a floor line.
- Do not mix new designs into animation batches.

## Batch Plan
1. Idle, walk, run first.
2. Hurt, knockdown, recover next.
3. Combat moves only after locomotion is stable.
4. Supers last because they need VFX and timing events.
5. Top-down directions generated separately from side-view brawler sheets.

## Output Required
```text
characters/[id]/source/anchor.png
characters/[id]/clips/[action].mp4
characters/[id]/frames/[action]/*.png
characters/[id]/sheets/[action].png
characters/[id]/manifest.animations.json
characters/[id]/proof/[id]_contact_sheet.png
```

## Acceptance Criteria
- Full set uses one design identity.
- Each action has a sprite sheet and manifest entry.
- Bad frames are documented.
- Phaser can load the animation set.

## Security and API Rules
- Never hardcode API keys, tokens, passwords, private URLs, wallet secrets, or credentials into generated code.
- Use environment variables such as `FAL_KEY` or `.env.local` placeholders only.
- Before writing files, inspect the project tree and preserve existing user assets.
- Keep generated code deterministic, testable, and reversible.
- Ask for approval before deleting, overwriting, or mass-renaming production assets.

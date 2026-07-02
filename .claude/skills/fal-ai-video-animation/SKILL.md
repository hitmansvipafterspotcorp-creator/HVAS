---
name: fal AI Video Animation
description: Animate anchored game designs with fal image-to-video/reference-to-video while preserving on-model arcade sprite motion.
---

## Mission
Use this skill when the user wants fal.ai video models to turn source designs into motion references or sprite animation sources: idle, walk, run, attacks, supers, hurt, KO, transitions, VFX pops, and cutscenes.

## Required Behavior
- Always start from a locked source design or anchor image.
- Use image-to-video or reference-to-video for motion generation.
- Preserve identity, outfit, body proportions, shoes, emblem, and weapon state.
- Generate short motion clips that can be frame-extracted into sprite sheets.
- Never accept drifting idle, sliding feet, backward kicks, or off-model limb swaps as final.

## Recommended fal Video Pattern
- Use `@fal-ai/client` in JavaScript or `fal_client` in Python.
- Use `FAL_KEY` from environment.
- Prefer current fal image-to-video/reference-to-video endpoints approved by the user.
- For high-action cinematic previsualization, Seedance-style image-to-video endpoints can be used when available.

## Motion Prompt Template
```text
Animate this locked game character anchor into [ACTION].
Game use: 2D arcade brawler sprite animation reference.
Camera: locked side-view, no zoom, no pan, no rotation.
Character: stay on-model, same outfit, same face, same shoes, same proportions.
Feet: preserve floor contact, no sliding, no drifting root.
Motion: [ACTION SPECIFIC MOTION].
Background: transparent, simple flat, or removable solid color if transparency is not supported.
Loop: [yes/no].
Duration: [1-4 seconds].
```

## Action-Specific Constraints
```text
Idle: breathing only, feet locked, shoulders subtle, no walking drift.
Walk: 4-8 readable steps, root moves consistently, no moonwalk.
Run: forward lean, clear stride, no teleporting.
Jab: front arm extends and returns, rear foot planted.
Kick: correct lead leg, foot travels forward, no backward kick.
Dodge: quick side slip or backstep, returns to ready stance.
Hurt: impact recoil, no costume change.
KO: fall or collapse, final pose stable.
Super: anticipation -> flash -> strike -> recovery, readable silhouette.
VFX: hit spark pops from impact point, no character morphing.
```

## Frame Extraction Contract
After generating a clip:
1. Extract frames at 8, 12, or 16 fps depending on motion speed.
2. Remove bad transition frames.
3. Normalize root anchor to the feet/floor point.
4. Crop to consistent canvas size.
5. Export PNG sequence and sprite sheet.
6. Write animation metadata: `frameWidth`, `frameHeight`, `fps`, `loop`, `root`, `events`.

## Acceptance Criteria
- The character stays on model.
- The feet do not drift unless the action intentionally moves.
- The camera is locked.
- The action reads in silhouette.
- Extracted frames can be used in Phaser without re-timing the whole combat system.

## Security and API Rules
- Never hardcode API keys, tokens, passwords, private URLs, wallet secrets, or credentials into generated code.
- Use environment variables such as `FAL_KEY` or `.env.local` placeholders only.
- Before writing files, inspect the project tree and preserve existing user assets.
- Keep generated code deterministic, testable, and reversible.
- Ask for approval before deleting, overwriting, or mass-renaming production assets.

---
name: AI Animation Debug Fix
description: Root-cause and fix broken AI animations: drifting idle, sliding feet, backward kick, off-model frames, and bad loops.
---

## Mission
Use this skill when generated animation clips or sprite sheets are broken. The objective is to identify the exact failure, fix what can be fixed mechanically, and send only the truly bad clips back for regeneration.

## Common Failure Modes
```text
DRIFTING_IDLE: root moves when it should stay still.
SLIDING_FEET: feet move across floor without stride logic.
BACKWARD_KICK: attack goes opposite facing direction.
OFF_MODEL: face, outfit, body size, or shoes change.
CAMERA_DRIFT: camera pans/zooms instead of locked gameplay view.
BAD_LOOP: first and last frames do not connect.
BAD_CONTACT: hit event happens before/after impact pose.
CROPPED_LIMB: hand, foot, weapon, or head is cut off.
```

## Debug Procedure
1. Create a contact sheet with frame numbers.
2. Mark the root anchor per frame.
3. Mark foot contact points.
4. Compare facing direction to intended attack direction.
5. Compare silhouette against anchor design.
6. Identify whether the issue is:
   - fixable by root stabilization,
   - fixable by frame removal/reorder,
   - fixable by horizontal flip,
   - requires regeneration.

## Mechanical Fixes
- **Root stabilization:** shift each frame so the root anchor stays fixed.
- **Foot lock:** pin planted foot during idle, block, charge, and attack windup.
- **Frame trim:** remove transition frames before/after the intended move.
- **Loop closure:** copy or blend the first pose at the end only when it does not affect gameplay timing.
- **Facing correction:** mirror only if the costume/emblem still makes sense and handedness is not important.

## Regeneration Prompt Patch Templates
### Drifting Idle
```text
Regenerate idle. Locked side-view camera. Character stands in place. Feet planted on same floor mark. Breathing only. No stepping. No walking. No camera movement.
```

### Backward Kick
```text
Regenerate forward kick. Character faces screen-right. Lead leg kicks toward screen-right only. Rear leg stays planted. No backward kick. No spin unless specified.
```

### Off-Model
```text
Regenerate using the provided anchor exactly. Same face, same jacket, same shoes, same body proportions, same emblem. Do not change costume, hairstyle, colors, or body size.
```

## Acceptance Criteria
- Every fixed sheet has a before/after contact sheet.
- The root drift value is documented.
- Hit event frames line up with visual impact.
- Only clips that cannot be fixed locally are sent back to fal/Spriterrific.

## Security and API Rules
- Never hardcode API keys, tokens, passwords, private URLs, wallet secrets, or credentials into generated code.
- Use environment variables such as `FAL_KEY` or `.env.local` placeholders only.
- Before writing files, inspect the project tree and preserve existing user assets.
- Keep generated code deterministic, testable, and reversible.
- Ask for approval before deleting, overwriting, or mass-renaming production assets.

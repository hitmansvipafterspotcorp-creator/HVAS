# HITGEAR OS — Device QA Checklist

## Boot & Install

- [ ] Page loads in Chrome (desktop)
- [ ] Page loads in Firefox (desktop)
- [ ] Page loads in Safari (desktop)
- [ ] Page loads in Chrome (Android)
- [ ] Page loads in Safari (iOS)
- [ ] Boot animation completes (loading bar fills to 100%)
- [ ] OS menu appears with 4 icons
- [ ] PWA install prompt fires (Chrome/Edge desktop)
- [ ] "Add to Home Screen" works on Android Chrome
- [ ] "Add to Home Screen" works on iOS Safari
- [ ] App launches fullscreen from home screen icon
- [ ] Service worker registers (check DevTools > Application > SW)
- [ ] Game loads offline after first visit

## Navigation

- [ ] OS menu keyboard navigation (arrow keys + Enter)
- [ ] All 7 game menu items clickable
- [ ] Back button returns from each screen
- [ ] Character select shows 13 cards with correct lock state
- [ ] Venue map shows 16 venues
- [ ] VIP Status screen shows correct tier + progress bar
- [ ] Options screen toggles save correctly

## Character Select

- [ ] Creator (unlocked by default)
- [ ] DJ (unlocked by default)
- [ ] FAMU Student A locked until 300 pts
- [ ] FAMU Student B locked until 600 pts
- [ ] Influencer locked until 1000 pts
- [ ] Photographer locked until 1500 pts
- [ ] Promoter locked until 2000 pts
- [ ] Dancer locked until 2800 pts
- [ ] Vendor locked until 3800 pts
- [ ] Security locked until 5000 pts
- [ ] Host locked until 6500 pts
- [ ] FSU Student A locked until 8000 pts
- [ ] FSU Student B locked until 10000 pts

## Venue Map

- [ ] Venues 1-2 unlocked by default (After Spot, Club Cascades)
- [ ] All 16 venues display correct name + emoji
- [ ] Locked venues show lock icon
- [ ] cameraType displayed correctly per venue

## Gameplay — Sidescroll Mode

- [ ] Canvas renders background layers (parallax)
- [ ] Player renders as colored rect + emoji
- [ ] Player moves left/right (WASD / arrow keys)
- [ ] Player jumps (W / Up / Space)
- [ ] Jump has gravity arc
- [ ] Attack (Z/X) spawns hitbox + damages enemy
- [ ] Enemy takes damage (HP bar decreases)
- [ ] Enemy dies and disappears
- [ ] Wave clears when all enemies defeated
- [ ] Next wave spawns after clear
- [ ] Boss spawns with larger size + glow
- [ ] Boss defeated → mission complete
- [ ] Camera follows player horizontally

## Gameplay — Topdown Mode

- [ ] Player moves 4 directions (WASD / arrow keys)
- [ ] Wall collision prevents walking through walls
- [ ] NPCs show emoji + proximity talk prompt
- [ ] [Y] prompt appears near NPCs / props / doors
- [ ] Dialog box shows NPC text on interact
- [ ] Props interactable
- [ ] Door to next venue shows locked state correctly

## Combat

- [ ] Attack connects with AABB overlap check
- [ ] Damage numbers float up on hit
- [ ] Combo counter increments on consecutive hits
- [ ] Combo resets on miss/dodge
- [ ] Block reduces damage
- [ ] Hitstun freezes enemy briefly
- [ ] Screen shake on heavy hit
- [ ] Meter fills on hit
- [ ] Super/Special usable when meter full (C / Y button)
- [ ] Finisher prompt appears at low enemy HP
- [ ] Finisher triggers correctly

## Lip Sync Bingo

- [ ] Player mode: card generates with 5×5 grid
- [ ] FREE SPACE at center (row 2, col 2) pre-marked
- [ ] Tapping cell marks it (neon highlight)
- [ ] Host mode: Call Song button works
- [ ] Called song displayed
- [ ] Song history viewable
- [ ] Round 1 win detected (any single line)
- [ ] Round 2 win detected (2 lines)
- [ ] Round 3 win detected (full card)
- [ ] Party mode reduces min players to 2

## Save System

- [ ] New game saves to localStorage `hitgear_save_v1`
- [ ] Points persist after browser refresh
- [ ] Completed venues marked complete
- [ ] Unlocked characters persist
- [ ] Dev reset clears save data

## Performance

- [ ] 60fps maintained during normal gameplay
- [ ] No frame drops below 30fps during 5-enemy waves
- [ ] Canvas fits screen without scrollbars (landscape)
- [ ] Touch controls visible and tappable on mobile
- [ ] D-pad and ABXY buttons all register input
- [ ] No memory leaks after 10 minutes of play (Chrome DevTools heap)

## Edge Cases

- [ ] Player cannot walk off left/right stage edge
- [ ] Dead enemies cannot be hit again
- [ ] Boss cannot respawn after defeat
- [ ] Bingo card does not repeat songs within same card
- [ ] Song pool has enough songs (39 in pool, 24 non-free cells)
- [ ] Game Over screen shows retry option
- [ ] Victory screen shows points earned + continue option

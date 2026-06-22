# Venue backdrop art

Drop finished venue PNGs here. The game auto-loads them when present and falls
back to the built-in neon-vector backdrops when they're missing.

## Stage 1 — wired up now

| Filename                          | Used by                                                        | Best source sheet |
|-----------------------------------|---------------------------------------------------------------|-------------------|
| `cafe8fifty_exterior.png`         | Quest venue 1 (side-scroll) + Pete & Big Soulja arcade fights | "STAGE 1 OUTSIDE — CAFE8FIFTY EXTERIOR — FINISHED DESIGN" |
| `hvas_interior.png`               | Quest venue 3 (top-down) + KT final arcade fight              | "STAGE 1 INSIDE — HITMANS VIP AFTER SPOT INTERIOR — FINISHED DESIGN" |

### How to add them
1. On GitHub (logged in as owner), open `assets/venues/`
2. **Add file → Upload files**
3. Upload the two finished-design PNGs, renamed exactly as above
4. Commit to branch `claude/gracious-rubin-3klank`

That's it — the backdrops appear automatically on next load. No code changes needed.

> Tip: the full-frame **FINISHED DESIGN** composites work best as backdrops.
> The labeled module/sprite sheets (walls, doors, signage, props) are for
> piece-by-piece scene building, which we can wire in next.

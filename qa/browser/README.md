# Browser tests

These drive the built app in real Chromium over CDP, because some of what this
app promises cannot be asserted from the server:

| file | covers |
|---|---|
| `solo.mjs` | Solo vs CPU: lip sync squares are performed for, passing forfeits them, a take comes back ready to post — and is kept on the phone, surviving a reload, listed in the Record tab with no venue at all. Runs with no backend. |
| `lipsync-battle.mjs` | Standalone Lip Sync Battle: sign in, open the screen, join a lobby, watch a bout arrive. |
| `card-and-rotation.mjs` | The card holds its order as songs are called; auto-fill; and sideways-play-only in both orientations. |

They are **not** in the deploy gate (`server/test-gate.mjs`) and must not be:
they need a Chromium binary at a path this venue's laptop does not have, so
gating on them would block every deploy. The gate stays server-side and fast.

Run one directly, with the app built first:

    cd hitmans_vip_membership_app && npm run build
    node qa/browser/solo.mjs

`CHROME` at the top of each file is the browser path — change it to match the
machine. On a box with Playwright installed that is usually somewhere under
`~/.cache/ms-playwright/`.

Why they earned their place: between them these caught a menu tile that
navigated nowhere, a champion banner colliding with the venue crest, placement
plates rendered as unreadable mush, and a service worker serving a stale bundle
— none of which failed a build or a server test.

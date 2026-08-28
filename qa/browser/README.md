# Browser tests

These drive the built app in real Chromium over CDP, because some of what this
app promises cannot be asserted from the server:

| file | covers |
|---|---|
| `solo.mjs` | Solo vs CPU: lip sync squares are performed for, passing forfeits them, a take comes back ready to post — and is kept on the phone, surviving a reload, listed in the Record tab with no venue at all. Runs with no backend. |
| `lipsync-battle.mjs` | Standalone Lip Sync Battle: sign in, open the screen, join a lobby, watch a bout arrive. |
| `offline.mjs` | The venue loses its internet: the laptop in the room keeps serving, and a member can still load the app from their phone's cache and reach the live round. |
| `rooms.mjs` | The venue's permanent id, the room directory, and the one that matters: move a venue to a completely different address and the member's app reconnects itself with no failure screen and nothing to type. |
| `door.mjs` | Getting into a room: a listed room is one tap and the address box stays out of the way, an empty directory brings it back, and "Scan venue QR" opens a camera you can actually see and aim. |
| `solo-round.mjs` | A solo round end to end: the theme you pick is the deck you play, the card is sideways-only, the clock and the meters are live venue art, the round holds while you perform, the clip is cut to the venue's window and its length IS the performance length — and with no song, nothing gets called. |
| `sweep.mjs` | Wide rather than deep: signs in with **no venue**, walks every screen and tab a member can reach by tapping, and after every tap asks the same two questions — is the app still mounted, and is any control on screen invisible or zero-sized? This is the net for the two shapes that keep reaching the venue. |
| `room.mjs` | The Room on a phone: two members post, react, comment, follow, message and block each other. Asserts the compose box sits above the feed, the directory lists people by trade, the venue cannot open a conversation, and — the one it exists for — that no member's contact or door number appears anywhere on any of these screens. |
| `standing.mjs` | The relationship itself: the covenant re-read at the version the member signed, with its fingerprint; the record the association holds about them, savable to their own phone; and the way out — resigning, the door actually refusing them by name rather than accusing them, and rejoining in one tap from the same screen. |
| `earn.mjs` | The four ways a member makes money, on one phone: what the venue keeps is on screen before anything is listed, a booking stake is a bond that comes back and is never sold as an investment, a licence bought and not paid for reads PENDING — NOT SETTLED, and the shared venue code can read the money queue but cannot move a cent of it. |
| `card-and-rotation.mjs` | The card holds its order as songs are called; auto-fill; sideways-play-only in both orientations; and play-along keeping the video frame sealed so its title cannot be read. |

`fake-youtube.js` is not a suite — it is a stand-in for the YouTube IFrame API,
injected before the app boots by the suites that need one. Solo will not call a
square without a song playing, so those suites have to supply the player: going
to youtube.com for real would make every run depend on a third party's uptime,
on a search result that changes, and on a network the runner may not have.

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
plates rendered as unreadable mush, a service worker serving a stale bundle, a
QR scanner whose camera was mounted invisible at zero height, a hook declared
below an early return that white-screened the entire app the moment a member
opened Lip Sync Bingo without a venue, a support screen no member could reach
because its only entry point lived inside a widget that returns null, a whole
house-side API sending the member's token, an approved award that fell off every
screen with nobody able to record the payment, and a staff sign-in that
white-screened the app whenever the server granted a role the picker had never
heard of, and a host console you could only reach by going in as a MEMBER
through the game menu — none of which failed a build or a server test.

That last one now also has a source-level guard in the deploy gate
(`server/render-safety-test.mjs`), because a white screen is too expensive to
rely on someone remembering to run a browser suite.


One warning for anyone adding a suite that needs two devices: give each one its
own static server, and therefore its own origin. Two pages served from the same
host and port share one `localStorage`, so the second "phone" signing in
silently overwrites the first one's session token. In `team.mjs` that looked
exactly like the owner losing their admin rights halfway through the suite, and
the bug was in the harness rather than in anything it was testing.

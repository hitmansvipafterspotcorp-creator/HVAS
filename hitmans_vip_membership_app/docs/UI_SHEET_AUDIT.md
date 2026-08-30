# UI Sheet Audit

Rule: crop and use real components only. Do not place sheet labels, build notes, safe-area guides, assembled previews, flow examples, fake names, fake IDs, fake QR codes, example numbers, sample graphs, sample player lists, room codes, queue rows, or demo counts into the app.

Important data rule: words and numbers inside a component often show what dynamic app data belongs there. They are not automatically the asset. For example, "Today's Entries 128," "Event Access 74," "Venue Access 56," room code examples, player counts, fake member names, fake member IDs, and sample graphs must be recreated as live UI data later, not pasted as static crops.

## Sheet 01 - Membership Tiers / Pricing

Use:
- Tier cards: Daily, Weekly, Monthly, Yearly, VIP.
- Tier chips: Daily, Weekly, Monthly, Yearly, VIP.
- Status ribbons: Active Plan, Expires Soon, VIP Verified, Staff Access, Event Access, Venue Access.
- Action buttons: Select Plan, Upgrade To VIP, Renew Plan.
- Price digits only if dynamic price rendering is needed.

Do not use:
- Static example prices such as 88.88 or assembled pricing values.
- Header label text like "Membership Tiers / Pricing" as app UI.
- "Assembled Preview" area.
- Drag/drop notes or explanatory labels.
- Member pass wallet strip example unless recreated as live app UI.

## Sheet 02 - Price Digit Strip

Use:
- Digits 0-9.
- Dollar symbol, decimal, slash, blank price tile.

Do not use:
- Example usage preview.
- Sheet title, crop labels, feature notes, or footer notes.

## Sheet 03 - Menu Setup / Entry Rules Guide

Use as instructions:
- Member menu order: Home, My Pass, Event Access, Venue Access, Profile, History.
- Staff menu order: Dashboard, Scan App, Search Member, Verify Tier, Grant/Deny Entry, Check-In Log.
- Entry rules and staff verification logic.

Do not use:
- Quick Flow as visible UI.
- Assembled preview example.
- Setup rules block as an app panel.
- The guide sheet itself as a visible asset.

## Sheet 04 - Member Entry / Staff Verification

Use:
- Pass cards by tier.
- Status chips: Active, Expired, Checked In, VIP, Staff, Access Granted, Access Denied, Private Member.
- Action buttons: Scan App, Verify Member, Grant Entry, Deny Entry, Rescan, Manual Check-In.
- Staff check-in panel pieces only if example text/fields are not pasted as live data.
- QR frame, member profile/pass card shell, verification success/failure banners.
- Role chips: Member, Staff, Host, Security.

Do not use:
- Assembled door verification preview.
- Component labels.
- Example names, member IDs, expiry dates, QR codes, counts, graphs, or widget numbers unless app data generates them live.
- Today's Entries, Event Access, and Venue Access widgets as static crops; those are visual examples for future live dashboard components.

## Sheet 05 - HITKOIN Logo

Use:
- Logo/emblem as brand mark, app icon source, loading emblem, currency icon.

Do not use:
- As a full-screen background without layout treatment.

## Sheet 06 - Lip Sync Bingo Style Kit

Use:
- Title banner, panel frames, card frame, tabs, primary/secondary/tertiary/danger buttons.
- Gameplay action buttons: Join, Mark, Verify, Claim.
- Progress bars, dividers, reward chips, timer frame, toggles, selector accents.

Do not use:
- Preview assembled screen.
- Component labels.

## Sheet 07 - TV Fullscreen / Assembly / Live Display

Use:
- Top status ribbon, huge timer frame, current song banner, round prize badge, winners banner, lower-third ticker, bingo card frame.

Do not use:
- Assembled fullscreen preview.
- Safe-area guides.
- Export notes or app control notes.

## Sheet 08 - Lip Sync Bingo Lobby

Use:
- Welcome header, QR join card, invite panel, player list rows, room code panel, join/ready/start/party mode buttons, schedule chip.
- Lobby tabs and status chips.

Do not use:
- Lobby assembled preview.
- Sheet number label.
- Component labels.
- Static room codes, QR codes, player names, player counts, schedule times, or member list examples.

## Sheet 09 - Player Bingo Card Gameplay

Use:
- Bingo card grids, square states, genre chips, song title chip, current song panel, round prize panel, timer, card number badge.
- Mark, Undo, Confirm buttons.
- Bottom navigation: Card, History, Chat, Rewards.

Do not use:
- Full card screen example.
- Component labels.

## Sheet 10 - Host / DJ Control Dashboard

Use:
- Host header, live round control panel, round selector tabs, prize chips, host action buttons, next song button, timer controls.
- Song call queue rows, song history sidebar, host notes panel, player count widgets, warning badges.

Do not use:
- Preview dashboard example.
- Component labels.
- Static queue songs, counts, timers, notes, or history rows.

## Sheet 11 - Card Verification

Use:
- Member check-in panel, QR scan frame, keypad, verification result panel, status rows, valid/expired/trespass chips.
- Member profile chip, card owner badge, verify/reject buttons, host approval chip, entry status banner.

Do not use:
- Assembled preview.
- Component labels.

## Sheet 12 - Song Queue / Call History / Round Tracker

Use:
- Song queue, now playing panel, previous songs, call order, round tracker, timer variants, setlist chips, history filters, search bar, objective panel.

Do not use:
- Host view assembled preview.
- Placeholder examples as final content unless generated by app data.

## Sheet 13 - Winner Validation / Payout / Prizes

Use:
- Bingo validation panel, winning pattern frames, winner spotlight frame, rank ribbons, status chips, prize badges, payout option buttons, reward counters, host approval controls, pattern icons.

Do not use:
- Assembled preview.
- Fake payout user/email data.

## Sheet 14 - Membership Dues / Card Packs / QR Join

Use only:
- Payment method button styling when payment actions are needed.
- Upgrade badges if reused for membership status.
- QR join card style if needed.

Do not use:
- Dues options.
- Card packs.
- Pack purchase buttons.
- Private member rules panel.
- Assembled preview.
- Static QR code, dues values, renewal timers, rule copy, or membership status bar examples.

## Sheet 15 - Party Mode Battlez

Use:
- Party mode, battle mode, quick play chips.
- Team-vs-team badge, audience vote meter, hype meter, reaction chips.
- Start battle button only if Party Mode ships.

Do not use:
- Assembled preview.
- Lobby card text as fixed app copy.

## Sheet 16 - Digit Strip

Use:
- Clean numeric strip for dynamic price, count, or code rendering.

Do not use:
- As a decorative full-width app image.

## Sheet 17 - Loading Screen

Use:
- Loading background and brand direction.
- Build a live synced loader on top of it.

Do not use:
- Static loading bar as the actual progress indicator.
- Hard-coded loading text as app state if the live loader supplies it.

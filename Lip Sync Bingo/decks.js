/*
 * decks.js — Song pool + decks for Lip Sync Bingo (HITMANS VIP AFTER SPOT).
 *
 * The pool combines Korey's original 39-song SONG_POOL (from HVAS
 * runtime/bingo_engine.js) with the 24 songs on his After Spot Starter card.
 * Overlaps (Cuff It, Kill Bill, Mask Off) are de-duplicated -> 60 songs.
 * Nov 19, 2026 expansion (Korey's order: "90s hip hop, crunk, everything
 * that was there already"): + 34 '90s hip hop pillars (src:'90s') and
 * + 16 crunk / Down South records (src:'crunk') -> 110 songs total.
 *
 * `yt` holds a VERIFIED YouTube video ID. Nov 20, 2026 full audit (Korey's
 * order: "every song has to play"): all primaries were checked against the
 * YouTube oEmbed endpoint (HTTP 200 = exists + embeddable) and cross-checked
 * by artist/title. `yt2` is a second verified upload of the same song
 * (official audio / Topic / lyric upload) that the player falls back to
 * automatically if the primary refuses to embed.
 * Nov 20, 2026 expansion (Korey's orders: "get like 200 songs", country /
 * house / afrobeats lanes, the VERSUS series): + 90 songs -> 200 total.
 * Nov 20, 2026 round 3 (Korey: "Grow past 200 — add my matchups"):
 * + 160 songs -> 360 total, building the eight named versus decks
 * (Pusha T/Wayne, T.I./Jeezy, Jeezy/Gucci, Beyoncé/Rihanna, Nicki/Cardi,
 * Brandy/Monica, Mariah/Whitney, Mary J./Faith) as true 12-vs-12s.
 * All 360 primaries and 359 of 360 `yt2` backups are oEmbed-verified the
 * same way (only Smino's 'Slow Down' has no second upload). A song whose
 * track could not be verified was NOT added — see TRACK-AUDIT-2026-11-20.md.
 * Nov 22, 2026 round 4 (Korey: "Grow the song pool"): + 40 songs -> 400
 * total, building two more named versus decks as true 12-vs-12s:
 * Michael Jackson vs Prince (24 new catalog songs) and Kendrick Lamar
 * vs J. Cole (J. Cole's catalog built out + 'All the Stars'), plus four
 * pool staples (Nelly, DMX, The Weeknd, Dua Lipa). All 40 new primaries
 * AND all 40 `yt2` backups are oEmbed-verified the same way — see
 * TRACK-AUDIT-2026-11-22-ROUND4.md. Three first-choice songs could not
 * be verified to the standard and were swapped for verified catalog
 * songs by the same artists ('Bad' -> 'Black or White'; 'Let's Go
 * Crazy' -> 'I Wanna Be Your Lover'; 'Diamonds and Pearls' -> 'Gett Off').
 * One primary was REPLACED in the audit: 'slow-down' pointed at the wrong
 * song ('Low Down Derrty Blues'); it now points at Smino's official
 * 'Slow It Down' upload. IDs are never guessed — see TRACK-AUDIT-2026-11-20.md.
 *
 * UMD: loads in the browser as window.LSB_DATA and in Node via require()
 * so the logic tests can verify deck integrity.
 */
(function (root, factory) {
  var data = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = data;
  else root.LSB_DATA = data;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Song pool. `src:'starter'` = on the After Spot Starter card.        */
  /* `src:'pool'` = from Korey's original 39-song SONG_POOL.              */
  /* `src:'90s'` / `src:'crunk'` = era records added Nov 19, 2026.       */
  /* `src:'versus'` / `'country'` / `'afro'` / `'house'` / `'queens'` /    */
  /* `'party'` = the Nov 20, 2026 expansion to 200 songs.                 */
  /* `src:'versus3'` = round 3, the eight named versus matchups (360).    */
  /* `src:'versus4'` / `'round4'` = round 4, 400 songs (Nov 22, 2026). */
  /* Every song's yt (+ yt2 backup) was oEmbed-verified Nov 20, 2026.    */
  /* ------------------------------------------------------------------ */
  var SONGS = [
    /* ---- After Spot Starter 24 (YouTube IDs verified) ---- */
    { id: 'uptown-funk',        artist: 'Bruno Mars',      title: 'Uptown Funk',                  yt: 'OPf0YbXqDm0', yt2: '7Ya2U8XN_Zw', src: 'starter' },
    { id: 'a-milli',            artist: 'Lil Wayne',       title: 'A Milli',                      yt: '1Vf4mMCpNY0', yt2: 'w81Eci5bkXc', src: 'starter' },
    { id: 'up',                 artist: 'Cardi B',         title: 'Up',                           yt: 'rCiBgLOcuKU', yt2: 'N2LPTvuIQ5U', src: 'starter' },
    { id: 'cuff-it',            artist: 'Beyoncé',         title: 'Cuff It',                      yt: 'yrtWLyp5gLI', yt2: 'SjqmSPZhF3s', src: 'both' },
    { id: 'super-bass',         artist: 'Nicki Minaj',     title: 'Super Bass',                   yt: '4JipHEz53sU', yt2: 'aFwmvQ1pSEc', src: 'starter' },
    { id: 'work',               artist: 'Rihanna',         title: 'Work',                         yt: 'HL1UzIK-flA', yt2: 'puxjq3p-fU0', src: 'starter' },
    { id: 'rock-the-boat',      artist: 'Aaliyah',         title: 'Rock The Boat',                yt: '3HSJU5fDg0A', yt2: 'QOgEy06B-FY', src: 'starter' },
    { id: 'i-wanna-dance',      artist: 'Whitney Houston', title: 'I Wanna Dance With Somebody',  yt: 'eH3giaIzONA', yt2: 'OnZmC6B06Kk', src: 'starter' },
    { id: 'big-energy',         artist: 'Latto',           title: 'Big Energy',                   yt: 'T8GpG8C0YzA', yt2: 'WoIyBnyR_fA', src: 'starter' },
    { id: 'mask-off',           artist: 'Future',          title: 'Mask Off',                     yt: 'xvZqHgFz51I', yt2: 'aWb8z-KhZdo', src: 'both' },
    { id: 'no-scrubs',          artist: 'TLC',             title: 'No Scrubs',                    yt: 'FrLequ6dUdM', yt2: 'rmOd7z8Edrg', src: 'starter' },
    { id: 'buy-u-a-drank',      artist: 'T-Pain',          title: 'Buy U A Drank',                yt: 'dBrRBZy8OTs', yt2: 'Phx1k2mWWZI', src: 'starter' },
    { id: 'family-affair',      artist: 'Mary J. Blige',   title: 'Family Affair',                yt: 'znlFu_lemsU', yt2: 'BiucBz4wEak', src: 'starter' },
    { id: 'tomorrow-2',         artist: 'GloRilla',        title: 'Tomorrow 2',                   yt: 'zwa7NzNBQig', yt2: 'RfNHylx7qtA', src: 'starter' },
    { id: 'yeah',               artist: 'Usher',           title: 'Yeah!',                        yt: 'GxBSyx85Kp8', yt2: 'Ifu6TZnytlU', src: 'starter' },
    { id: 'bad-and-boujee',     artist: 'Migos',           title: 'Bad and Boujee',               yt: 'S-sJp1FfG7Q', yt2: 'DdFqRssN_Ys', src: 'starter' },
    { id: 'no-flockin',         artist: 'Kodak Black',     title: 'No Flockin',                   yt: 'UE_-obgiWm0', yt2: 'yw-1dAdgID0', src: 'starter' },
    { id: 'nice-for-what',      artist: 'Drake',           title: 'Nice For What',                yt: 'U9BwWKXjVaI', yt2: 'OZXrgCCzVu4', src: 'starter' },
    { id: 'never-too-much',     artist: 'Luther Vandross', title: 'Never Too Much',               yt: 'pNj9bXKGOiI', yt2: 'bNdIST6oPl4', src: 'starter' },
    { id: 'aston-martin-music', artist: 'Rick Ross',       title: 'Aston Martin Music',           yt: 'a35rNEBNiO4', yt2: 'DejyySJcbZA', src: 'starter' },
    { id: 'crazy-in-love',      artist: 'Beyoncé',         title: 'Crazy In Love',                yt: 'ViwtNLUqkMY', yt2: 'XKeUvUhxBCg', src: 'starter' },
    { id: 'kill-bill',          artist: 'SZA',             title: 'Kill Bill',                    yt: 'MSRcC626prw', yt2: 'SQnc1QibapQ', src: 'both' },
    { id: 'hey-ya',             artist: 'Outkast',         title: 'Hey Ya!',                      yt: 'PWgvGjAhvIw', yt2: 'JzqYDWBkX_Q', src: 'starter' },
    { id: 'one-two-step',       artist: 'Ciara',           title: '1, 2 Step',                    yt: 'iBHNgV6_znU', yt2: 'ZboXfvvxWls', src: 'starter' },

    /* ---- The rest of Korey's original 39-song SONG_POOL (yt + yt2 verified Nov 20, 2026) ---- */
    { id: 'hotline-bling',      artist: 'Drake',             title: 'Hotline Bling',              yt: 'uxpDa-c-4Mc', yt2: 'zt6aRKpf9T4', src: 'pool' },
    { id: 'humble',             artist: 'Kendrick Lamar',    title: 'HUMBLE.',                    yt: 'tvTRZJ-4EyI', yt2: 'ov4WobPqoSA', src: 'pool' },
    { id: 'titi-me-pregunto',   artist: 'Bad Bunny',         title: 'Tití Me Preguntó',           yt: 'Cr8K88UcO0s', yt2: 'qBUKfQRbzuk', src: 'pool' },
    { id: 'say-so',             artist: 'Doja Cat',          title: 'Say So',                     yt: 'pok8H_KF1FA', yt2: 'uAYG46w1SCA', src: 'pool' },
    { id: 'earfquake',          artist: 'Tyler, The Creator', title: 'EARFQUAKE',                 yt: 'HmAsUQEFYGI', yt2: 'Oo3wu3wx1i8', src: 'pool' },
    { id: 'wap',                artist: 'Cardi B',           title: 'WAP',                        yt: 'hsm4poTWjMs', yt2: 'Wc5IbN4xw70', src: 'pool' },
    { id: 'drip-too-hard',      artist: 'Lil Baby & Gunna',  title: 'Drip Too Hard',              yt: '_YzD9KW82sk', yt2: 'THcVOf1kNh0', src: 'pool' },
    { id: 'pushin-p',           artist: 'Gunna',             title: 'pushin P',                   yt: '9g08kucPQtE', yt2: '-705T4FioZE', src: 'pool' },
    { id: 'tick-tock',          artist: 'Young Thug',        title: 'Tick Tock',                  yt: 'sxfr4RooJkI', yt2: '3M9HDjbd01w', src: 'pool' },
    { id: 'xo-tour-llif3',      artist: 'Lil Uzi Vert',      title: 'XO TOUR Llif3',              yt: 'WrsFXgQk5UI', yt2: 'VcyFfcJbyeM', src: 'pool' },
    { id: 'sicko-mode',         artist: 'Travis Scott',      title: 'SICKO MODE',                 yt: '6ONRf7h3Mdk', yt2: 'HNMuFjl5FTo', src: 'pool' },
    { id: 'rockstar-post',      artist: 'Post Malone',       title: 'rockstar',                   yt: 'UceaB4D0jpo', yt2: '4GFAZBKZVJY', src: 'pool' },
    { id: 'savage',             artist: 'Megan Thee Stallion', title: 'Savage',                   yt: 'EOxj2ROIxok', yt2: 'eJEKHdvntPI', src: 'pool' },
    { id: 'act-up',             artist: 'City Girls',        title: 'Act Up',                     yt: 'F_VsAvS1kuo', yt2: 'UrfIZgAfhAM', src: 'pool' },
    { id: 'rockstar-dababy',    artist: 'DaBaby',            title: 'ROCKSTAR',                   yt: '83xBPCw5hh4', yt2: 'dmcUUgBsITU', src: 'pool' },
    { id: 'the-box',            artist: 'Roddy Ricch',       title: 'The Box',                    yt: 'UNZqm3dxd2w', yt2: 'uLHqpjW3aDs', src: 'pool' },
    { id: 'whats-poppin',       artist: 'Jack Harlow',       title: 'WHATS POPPIN',               yt: 'HIwAI05Y1fU', yt2: 'EzrM9RJnAhA', src: 'pool' },
    { id: 'pop-out',            artist: 'Polo G',            title: 'Pop Out',                    yt: 'g-uW3I_AtDE', yt2: 'o70FKH6n8LE', src: 'pool' },
    { id: 'shotta-flow',        artist: 'NLE Choppa',        title: 'Shotta Flow',                yt: '3W0e7aI0gAg', yt2: 'BUJ_hyOMIq8', src: 'pool' },
    { id: 'said-sum',           artist: 'Moneybagg Yo',      title: 'Said Sum',                   yt: 'T8pi91qWnRw', yt2: 'EGayfVfvVW8', src: 'pool' },
    { id: 'one-man',            artist: 'Big Sean',          title: 'One Man Can Change the World', yt: 'GBVotNefYME', yt2: 'MDit3OcIh58', src: 'pool' },
    { id: 'no-problem',         artist: 'Chance the Rapper', title: 'No Problem',                 yt: 'DVkkYlQNmbc', yt2: 'wJMARZrSXso', src: 'pool' },
    { id: 'the-need-to-know',   artist: 'Wale',              title: 'The Need To Know',           yt: 'YyEbAoFrYtg', yt2: 'H-02Wi0uc8k', src: 'pool' },
    { id: 'no-role-modelz',     artist: 'J. Cole',           title: 'No Role Modelz',             yt: '8HBcV0MtAQg', yt2: 'L6L4T3hwmQA', src: 'pool' },
    { id: 'exchange',           artist: 'Bryson Tiller',     title: 'Exchange',                   yt: 'aj9coPGuFkM', yt2: 'iOpJywrdCuQ', src: 'pool' },
    { id: 'gravity',            artist: 'Brent Faiyaz',      title: 'Gravity',                    yt: 'FBM4cdml6Qs', yt2: '3MtoSSfnhMc', src: 'pool' },
    { id: 'playing-games',      artist: 'Summer Walker',     title: 'Playing Games',              yt: 'SDSXLkD74KE', yt2: 'o_6HGBsMHeA', src: 'pool' },
    { id: 'roll-some-mo',       artist: 'Lucky Daye',        title: "Roll Some Mo'",              yt: '6WXmaJcguXo', yt2: 'S0KW2GD0MOg', src: 'pool' },
    { id: 'focus',              artist: 'H.E.R.',            title: 'Focus',                      yt: 'Uj9y5xkHZaU', yt2: 'Z5ze4CUAkE8', src: 'pool' },
    { id: 'none-of-your-concern', artist: 'Jhené Aiko',      title: 'None of Your Concern',       yt: 'PmeRjrz8KVw', yt2: 'MY7i-nk89cs', src: 'pool' },
    { id: 'come-down',          artist: 'Anderson .Paak',    title: 'Come Down',                  yt: '-OqrcUvrbRY', yt2: 'rptBpOCCMWc', src: 'pool' },
    { id: 'slow-down',          artist: 'Smino',             title: 'Slow Down',                  yt: 'f36Ldh__CNw', src: 'pool' },
    { id: 'good-days',          artist: 'SZA',               title: 'Good Days',                  yt: '2p3zZoraK9g', yt2: '0BdlKkvjEgA', src: 'pool' },
    { id: 'heartbreak-anniversary', artist: 'Giveon',        title: 'Heartbreak Anniversary',     yt: 'uWRlisQu4fo', yt2: 'nja_0BaQcNg', src: 'pool' },
    { id: 'need-to-know',       artist: 'Doja Cat',          title: 'Need to Know',               yt: 'dI3xkL7qUAc', yt2: 'f9CPymNwkYw', src: 'pool' },
    { id: 'leave-the-door-open', artist: 'Silk Sonic',       title: 'Leave the Door Open',        yt: 'adLGHcj_fmA', yt2: 'wIyNAsmGrl0', src: 'pool' },

    /* ---- '90s hip hop pillars (added Nov 19, 2026 — YouTube IDs verified) ---- */
    { id: 'california-love',    artist: '2Pac',              title: 'California Love',            yt: 'N0VdRLdg2ng', yt2: 'omfz62qu_Bc', src: '90s' },
    { id: 'juicy',              artist: 'The Notorious B.I.G.', title: 'Juicy',                   yt: '_JZom_gVfuw', yt2: '7Y8VPQcPHhY', src: '90s' },
    { id: 'mo-money-mo-problems', artist: 'The Notorious B.I.G.', title: 'Mo Money Mo Problems', yt: 'gUhRKVIjJtw', yt2: 'ss142Aix2Bo', src: '90s' },
    { id: 'if-i-ruled-the-world', artist: 'Nas',             title: 'If I Ruled the World',       yt: 'mlp-IIG9ApU', yt2: '-8dyp89uWxA', src: '90s' },
    { id: 'nuthin-but-a-g-thang', artist: 'Dr. Dre ft. Snoop Dogg', title: "Nuthin' but a 'G' Thang", yt: '8GliyDgAGQI', yt2: 'O-5O0aQ9u9c', src: '90s' },
    { id: 'gin-and-juice',      artist: 'Snoop Dogg',        title: 'Gin and Juice',              yt: 'fWCZse1iwE0', yt2: 'zowYObdYejQ', src: '90s' },
    { id: 'it-was-a-good-day',  artist: 'Ice Cube',          title: 'It Was a Good Day',          yt: 'h4UqMyldS7Q', yt2: 'b_M_Osdyg_A', src: '90s' },
    { id: 'hard-knock-life',    artist: 'Jay-Z',             title: 'Hard Knock Life',            yt: 'rN5OVPcyJ4Q', yt2: 'ZaSJMCTOb6g', src: '90s' },
    { id: 'ruff-ryders-anthem', artist: 'DMX',               title: "Ruff Ryders' Anthem",        yt: 'ThlhSnRk21E', yt2: 'aF29GPU-Ovc', src: '90s' },
    { id: 'cream',              artist: 'Wu-Tang Clan',      title: 'C.R.E.A.M.',                 yt: 'PBwAxmrE194', yt2: '4yNQ7_7I5aE', src: '90s' },
    { id: 'scenario',           artist: 'A Tribe Called Quest', title: 'Scenario',                yt: 'Q6TLWqn82J4', yt2: 'DiR5IFQmaPc', src: '90s' },
    { id: 'ms-jackson',         artist: 'Outkast',           title: 'Ms. Jackson',                yt: 'MYxAiK6VnXw', yt2: 'EUVo8epKwv0', src: '90s' },
    { id: 'doo-wop',            artist: 'Lauryn Hill',       title: 'Doo Wop (That Thing)',       yt: 'T6QKqFPRZSA', yt2: 'YjuhWhqY-bE', src: '90s' },
    { id: 'the-rain',           artist: 'Missy Elliott',     title: 'The Rain (Supa Dupa Fly)',   yt: 'hHcyJPTTn9w', yt2: 'dLKDHBHckMg', src: '90s' },
    { id: 'shoop',              artist: 'Salt-N-Pepa',       title: 'Shoop',                      yt: '4vaN01VLYSQ', yt2: 'Z8WZVHo2T8E', src: '90s' },
    { id: 'mama-said-knock-you-out', artist: 'LL Cool J',    title: 'Mama Said Knock You Out',    yt: 'vimZj8HW0Kg', yt2: 'nXca2sWFhRk', src: '90s' },
    { id: 'walk-this-way',      artist: 'Run-DMC ft. Aerosmith', title: 'Walk This Way',          yt: '4B_UYYPb-Gk', yt2: '5iRdVmEyhJI', src: '90s' },
    { id: 'fight-for-your-right', artist: 'Beastie Boys',    title: 'Fight for Your Right',       yt: 'eBShN8qT4lk', yt2: 'ClLCqZin9HY', src: '90s' },
    { id: 'u-cant-touch-this',  artist: 'MC Hammer',         title: "U Can't Touch This",         yt: 'otCpCn0l4Wo', yt2: 'SS4ixxxinDc', src: '90s' },
    { id: 'ice-ice-baby',       artist: 'Vanilla Ice',       title: 'Ice Ice Baby',               yt: 'rog8ou-ZepE', yt2: 'kPU9zuStFII', src: '90s' },
    { id: 'baby-got-back',      artist: 'Sir Mix-a-Lot',     title: 'Baby Got Back',              yt: 'X53ZSxkQ3Ho', yt2: 'aEqH2p6sEpg', src: '90s' },
    { id: 'jump-around',        artist: 'House of Pain',     title: 'Jump Around',                yt: 'jrL_LzX5wv4', yt2: 'XhzpxjuwZy0', src: '90s' },
    { id: 'insane-in-the-brain', artist: 'Cypress Hill',     title: 'Insane in the Brain',        yt: 'RijB8wnJCN0', yt2: 'eHR8hEIiSN4', src: '90s' },
    { id: 'tha-crossroads',     artist: 'Bone Thugs-n-Harmony', title: 'Tha Crossroads',          yt: 'VMYAEHE2GrM', yt2: 'T-_bM26SvSU', src: '90s' },
    { id: 'regulate',           artist: 'Warren G ft. Nate Dogg', title: 'Regulate',              yt: '1plPyJdXKIY', yt2: 'eiWClZrJSZY', src: '90s' },
    { id: 'gangstas-paradise',  artist: 'Coolio',            title: "Gangsta's Paradise",         yt: 'fPO76Jlnz6c', yt2: '7DXlY8LhWnI', src: '90s' },
    { id: 'around-the-way-girl', artist: 'LL Cool J',        title: 'Around the Way Girl',        yt: 'Sm36viw6q1U', yt2: 'Fwgt9Dxyyv0', src: '90s' },
    { id: 'unity',              artist: 'Queen Latifah',     title: 'U.N.I.T.Y.',                 yt: 'f8cHxydDb7o', yt2: '9BbUqzcNcl4', src: '90s' },
    { id: 'hip-hop-hooray',     artist: 'Naughty by Nature', title: 'Hip Hop Hooray',             yt: 'Rz1Xn1vzOM4', yt2: 'QcVrDjZch1g', src: '90s' },
    { id: 'no-diggity',         artist: 'Blackstreet ft. Dr. Dre', title: 'No Diggity',           yt: '3KL9mRus19o', yt2: '8cztOO0JVvA', src: '90s' },
    { id: 'killing-me-softly',  artist: 'Fugees',            title: 'Killing Me Softly',          yt: 'oKOtzIo-uYw', yt2: 'IXl0nMLIUsU', src: '90s' },
    { id: 'this-is-how-we-do-it', artist: 'Montell Jordan',  title: 'This Is How We Do It',       yt: '0hiUuL5uTKc', yt2: 'PQoy5OsfNT4', src: '90s' },
    { id: 'return-of-the-mack', artist: 'Mark Morrison',     title: 'Return of the Mack',         yt: 'uB1D9wWxd2w', yt2: 'K6nw3iKaxfA', src: '90s' },
    { id: 'hotstepper',         artist: 'Ini Kamoze',        title: 'Here Comes the Hotstepper',  yt: '15UffN8eilI', yt2: 'HiNke_YplfY', src: '90s' },

    /* ---- Crunk / Down South (added Nov 19, 2026 — YouTube IDs verified) ---- */
    { id: 'get-low',            artist: 'Lil Jon & The East Side Boyz', title: 'Get Low',         yt: 'IYH7_GzP4Tg', yt2: 'ZN43UoyAbwg', src: 'crunk' },
    { id: 'wait-whisper-song',  artist: 'Ying Yang Twins',   title: 'Wait (The Whisper Song)',    yt: 'HAnXIIv5He8', yt2: '9O2RRWOzTak', src: 'crunk' },
    { id: 'salt-shaker',        artist: 'Ying Yang Twins',   title: 'Salt Shaker',                yt: 'aJEzl31zL-I', yt2: 'mTaRSmDIrIQ', src: 'crunk' },
    { id: 'stand-up',           artist: 'Ludacris',          title: 'Stand Up',                   yt: 'pZG7IK99OvI', yt2: 'KIZ3fvuo840', src: 'crunk' },
    { id: 'move-bitch',         artist: 'Ludacris',          title: 'Move B***h',                 yt: 'tw429JGL5zo', yt2: 'JcJPx-6pzPY', src: 'crunk' },
    { id: 'stay-fly',           artist: 'Three 6 Mafia',     title: 'Stay Fly',                   yt: 'vBjzAdpZzf0', yt2: 'U_jq38d3FFI', src: 'crunk' },
    { id: 'knuck-if-you-buck',  artist: 'Crime Mob',         title: 'Knuck If You Buck',          yt: '9saEpqhBP5M', yt2: 'j1LHLuQ9P6k', src: 'crunk' },
    { id: 'lean-wit-it',        artist: 'Dem Franchize Boyz', title: 'Lean wit It, Rock wit It',  yt: '1OgHtf7DQNA', yt2: '6Vctz1FSvDA', src: 'crunk' },
    { id: 'laffy-taffy',        artist: 'D4L',               title: 'Laffy Taffy',                yt: '4eVxoIL_Nq0', yt2: 'fN7mjtxAQjA', src: 'crunk' },
    { id: 'tipsy',              artist: 'J-Kwon',            title: 'Tipsy',                      yt: 'VwXeN2FsE7w', yt2: 'Y3H_S65N1b4', src: 'crunk' },
    { id: 'freek-a-leek',       artist: 'Petey Pablo',       title: 'Freek-a-Leek',               yt: 'M48nlk-1kH8', yt2: '-rKEN1wuSVs', src: 'crunk' },
    { id: 'vice-versa',         artist: 'Pastor Troy',       title: 'Vice Versa',                 yt: '4hmn4cNXBdY', yt2: 'NS6dkt9CVnI', src: 'crunk' },
    { id: 'snap-yo-fingers',    artist: 'Lil Jon',           title: 'Snap Yo Fingers',            yt: 'AoA-ByjIf2M', yt2: '_Q-oS_SFyQo', src: 'crunk' },
    { id: 'soul-survivor',      artist: 'Young Jeezy',       title: 'Soul Survivor',              yt: 'gczBgNB-p1w', yt2: 'uwN4mVxOAHA', src: 'crunk' },
    { id: 'what-you-know',      artist: 'T.I.',              title: 'What You Know',              yt: '_Ym7Mg4yTZc', yt2: 'BjrF1-Qjt14', src: 'crunk' },
    { id: 'atliens',            artist: 'Outkast',           title: 'ATLiens',                    yt: 'ktc9hsSfUck', yt2: 'ES8CeZnEaF0', src: 'crunk' },
    /* ---- VERSUS catalogs: Drake + Kendrick depth (added Nov 20, 2026 — yt + yt2 verified) ---- */
    { id: 'gods-plan', artist: 'Drake', title: "God's Plan", yt: '9TincgwjtmA', yt2: '1gU-ELcGGqg', src: 'versus' },
    { id: 'one-dance', artist: 'Drake', title: 'One Dance', yt: '4IbRT6Vfl_U', yt2: 'FOqKN-ouAUE', src: 'versus' },
    { id: 'in-my-feelings', artist: 'Drake', title: 'In My Feelings', yt: 'DRS_PpOrUZ4', yt2: 'SD1tkI5-3dI', src: 'versus' },
    { id: 'started-from-the-bottom', artist: 'Drake', title: 'Started From the Bottom', yt: 'RubBzkZzpUA', yt2: '6p4Jj9kWZDI', src: 'versus' },
    { id: 'hold-on-were-going-home', artist: 'Drake', title: "Hold On, We're Going Home", yt: 'GxgqpCdOKak', yt2: 'Ni6izPw1xSU', src: 'versus' },
    { id: 'passionfruit', artist: 'Drake', title: 'Passionfruit', yt: 'COz9lDCFHjw', yt2: 'EgfsXTOn_pI', src: 'versus' },
    { id: 'headlines', artist: 'Drake', title: 'Headlines', yt: 'cimoNqiulUE', yt2: 'Sn3SUnL44w4', src: 'versus' },
    { id: 'take-care', artist: 'Drake', title: 'Take Care', yt: '-zzP29emgpg', yt2: '5bBcMt4mS2o', src: 'versus' },
    { id: 'controlla', artist: 'Drake', title: 'Controlla', yt: 'wVR8RJcMuC0', yt2: 'PsW85VbSau0', src: 'versus' },
    { id: 'best-i-ever-had', artist: 'Drake', title: 'Best I Ever Had', yt: 'HnpHMen64KE', yt2: 'Zfp3KfYH0xA', src: 'versus' },
    { id: 'alright', artist: 'Kendrick Lamar', title: 'Alright', yt: 'Z-48u_uWMHY', yt2: 'JocAXINz-YE', src: 'versus' },
    { id: 'dna', artist: 'Kendrick Lamar', title: 'DNA.', yt: 'NLZRYQMLDW4', yt2: 'ue4xoNqdc2I', src: 'versus' },
    { id: 'swimming-pools', artist: 'Kendrick Lamar', title: 'Swimming Pools (Drank)', yt: 'B5YNiCfWC3A', yt2: 'X0sVhnP15z8', src: 'versus' },
    { id: 'money-trees', artist: 'Kendrick Lamar', title: 'Money Trees', yt: '0nF69UTw99E', yt2: 'HJNa9Ih3haA', src: 'versus' },
    { id: 'king-kunta', artist: 'Kendrick Lamar', title: 'King Kunta', yt: 'hRK7PVJFbS8', yt2: 'AC4bb9Q9-04', src: 'versus' },
    { id: 'love-kendrick', artist: 'Kendrick Lamar', title: 'LOVE.', yt: 'ox7RsX1Ee34', yt2: 'w6NxHj3L_XY', src: 'versus' },
    { id: 'poetic-justice', artist: 'Kendrick Lamar', title: 'Poetic Justice', yt: 'yyr2gEouEMM', yt2: 'XWQJdnmpnhc', src: 'versus' },
    { id: 'not-like-us', artist: 'Kendrick Lamar', title: 'Not Like Us', yt: 'H58vbez_m4E', yt2: 'T6eK-2OQtew', src: 'versus' },
    { id: 'maad-city', artist: 'Kendrick Lamar', title: 'm.A.A.d city', yt: 'AuikIJZpt_8', yt2: 'Gqsk4dMr1SM', src: 'versus' },
    { id: 'bitch-dont-kill-my-vibe', artist: 'Kendrick Lamar', title: "Bitch, Don't Kill My Vibe", yt: 'GF8aaTu2kg0', yt2: 'hS14M2QeGjk', src: 'versus' },
    { id: 'fkin-problems', artist: 'A$AP Rocky', title: "F**kin' Problems", yt: 'liZm1im2erU', yt2: 'frhiMVQV_tw', src: 'versus' },

    /* ---- Country night (added Nov 20, 2026 — yt + yt2 verified) ---- */
    { id: 'jolene', artist: 'Dolly Parton', title: 'Jolene', yt: '5m71Jbi7NkU', yt2: 'Ixrje2rXLMA', src: 'country' },
    { id: '9-to-5', artist: 'Dolly Parton', title: '9 to 5', yt: 'UbxUSsFXYo4', yt2: 'd_vPJjqWxZM', src: 'country' },
    { id: 'i-walk-the-line', artist: 'Johnny Cash', title: 'I Walk the Line', yt: 'J-6fW66IUY4', yt2: '1okN-dOy8Zk', src: 'country' },
    { id: 'ring-of-fire', artist: 'Johnny Cash', title: 'Ring of Fire', yt: '1WaV2x8GXj0', yt2: '1Osyw6Svv8U', src: 'country' },
    { id: 'man-i-feel-like-a-woman', artist: 'Shania Twain', title: 'Man! I Feel Like a Woman!', yt: 'ZJL4UGSbeFg', yt2: 'o9OUSh_ADJ0', src: 'country' },
    { id: 'youre-still-the-one', artist: 'Shania Twain', title: "You're Still the One", yt: 'KNZH-emehxA', yt2: 'J6cNvjOn4gM', src: 'country' },
    { id: 'friends-in-low-places', artist: 'Garth Brooks', title: 'Friends in Low Places', yt: 'oCq-XZ0bwZs', yt2: 'eBdyGZ4wv60', src: 'country' },
    { id: 'chattahoochee', artist: 'Alan Jackson', title: 'Chattahoochee', yt: 'JW5UEW2kYvc', yt2: '9kkDgx01aHc', src: 'country' },
    { id: 'boot-scootin-boogie', artist: 'Brooks & Dunn', title: "Boot Scootin' Boogie", yt: 'd05tQrhNMkA', yt2: 'OyWTyVaF5Uc', src: 'country' },
    { id: 'neon-moon', artist: 'Brooks & Dunn', title: 'Neon Moon', yt: 'AxFdeZER8Eg', yt2: 'PcVpxD_6h9A', src: 'country' },
    { id: 'fancy', artist: 'Reba McEntire', title: 'Fancy', yt: 'zplc4Ienkws', yt2: 'FUN0U80hELo', src: 'country' },
    { id: 'strawberry-wine', artist: 'Deana Carter', title: 'Strawberry Wine', yt: 'Up06CryWQpE', yt2: '4s7YTkiHwCo', src: 'country' },
    { id: 'redneck-woman', artist: 'Gretchen Wilson', title: 'Redneck Woman', yt: '82dDnv9zeLs', yt2: '_6LryLILSUs', src: 'country' },
    { id: 'before-he-cheats', artist: 'Carrie Underwood', title: 'Before He Cheats', yt: 'WaSy8yy-mr8', yt2: '2l94odCZ4dg', src: 'country' },
    { id: 'need-you-now', artist: 'Lady A', title: 'Need You Now', yt: 'PMootRNTC-A', yt2: 'fbq7ZM0du-c', src: 'country' },
    { id: 'tennessee-whiskey', artist: 'Chris Stapleton', title: 'Tennessee Whiskey', yt: '4zAThXFOy2c', yt2: 'IBLruNfUqUs', src: 'country' },
    { id: 'fast-car-luke', artist: 'Luke Combs', title: 'Fast Car', yt: 'Fr7oYjnt3bM', yt2: 'UR5dciiZvUg', src: 'country' },
    { id: 'when-it-rains-it-pours', artist: 'Luke Combs', title: 'When It Rains It Pours', yt: 'uXyxFMbqKYA', yt2: 'eXQNv_jkOQc', src: 'country' },
    { id: 'last-night-morgan', artist: 'Morgan Wallen', title: 'Last Night', yt: 'GwXVMhVjjCI', yt2: 'TyjgBxIVmEc', src: 'country' },
    { id: 'whiskey-glasses', artist: 'Morgan Wallen', title: 'Whiskey Glasses', yt: 'FjBp30kjzTc', yt2: 'cSN8WpFtdsI', src: 'country' },
    { id: 'texas-hold-em', artist: 'Beyoncé', title: "Texas Hold 'Em", yt: '238Z4YaAr1g', yt2: 'jCOX8dT9q8M', src: 'country' },
    { id: 'country-roads', artist: 'John Denver', title: 'Take Me Home, Country Roads', yt: '1vrEljMfXYo', yt2: 'FpFms2tHRCA', src: 'country' },
    { id: 'sweet-home-alabama', artist: 'Lynyrd Skynyrd', title: 'Sweet Home Alabama', yt: 's6-MUQD_vPw', yt2: '-35W_FWCT9Q', src: 'country' },
    { id: 'old-town-road', artist: 'Lil Nas X', title: 'Old Town Road', yt: 'r7qovpFAGrQ', yt2: 'w2Ov5jzm3j8', src: 'country' },

    /* ---- Afrobeats / amapiano / dancehall (added Nov 20, 2026 — yt + yt2 verified) ---- */
    { id: 'essence', artist: 'Wizkid', title: 'Essence', yt: 'jipQpjUA_o8', yt2: 'm77FDcKg96Q', src: 'afro' },
    { id: 'ojuelegba', artist: 'Wizkid', title: 'Ojuelegba', yt: 'Q7QiLceJSLQ', yt2: 'GoELpRAkTag', src: 'afro' },
    { id: 'last-last', artist: 'Burna Boy', title: 'Last Last', yt: '421w1j87fEM', yt2: 'eWD4715QJ0I', src: 'afro' },
    { id: 'ye-burna', artist: 'Burna Boy', title: 'Ye', yt: 'lPe09eE6Xio', yt2: '4rz_kQiBxaQ', src: 'afro' },
    { id: 'on-the-low', artist: 'Burna Boy', title: 'On the Low', yt: 'Ecl8Aod0Tl0', yt2: 'IvJpo697LPY', src: 'afro' },
    { id: 'peru', artist: 'Fireboy DML', title: 'Peru', yt: 'pekzpzNCNDQ', yt2: 'GP_LpUoNx-I', src: 'afro' },
    { id: 'calm-down', artist: 'Rema', title: 'Calm Down', yt: 'CQLsdm1ZYAw', yt2: 'WcIcVapfqXw', src: 'afro' },
    { id: 'rush-ayra', artist: 'Ayra Starr', title: 'Rush', yt: 'crtQSTYWtqE', yt2: 'VAXGYrtO6gY', src: 'afro' },
    { id: 'love-nwantiti', artist: 'CKay', title: 'love nwantiti', yt: 'D-YDEyuDxWU', yt2: '7l22qaD31iE', src: 'afro' },
    { id: 'johnny-yemi', artist: 'Yemi Alade', title: 'Johnny', yt: 'C_XkTKoDI18', yt2: 'WRLB5O1plrY', src: 'afro' },
    { id: 'mad-over-you', artist: 'Runtown', title: 'Mad Over You', yt: 'Tb4X1BWNO5k', yt2: 'G8D98j8O0W4', src: 'afro' },
    { id: 'oliver-twist', artist: "D'banj", title: 'Oliver Twist', yt: 'I45Uu6ExQZo', yt2: 'EUYNnVgkAag', src: 'afro' },
    { id: 'kukere', artist: 'Iyanya', title: 'Kukere', yt: '4YvzTizFakk', yt2: 'umfhpvyIrrw', src: 'afro' },
    { id: 'personally-psquare', artist: 'P-Square', title: 'Personally', yt: 'ttdU19Kwce8', yt2: 'Pp6deX4Gies', src: 'afro' },
    { id: 'chop-my-money', artist: 'P-Square', title: 'Chop My Money', yt: 'ZcWbfOg3lmE', yt2: 'Egn1lzmKzUk', src: 'afro' },
    { id: 'african-queen', artist: '2Baba', title: 'African Queen', yt: '_A0fWBHu9pM', yt2: '4CQ6gMbsNDM', src: 'afro' },
    { id: 'fall-davido', artist: 'Davido', title: 'Fall', yt: '3Iyuym-Gci0', yt2: 'wITyUVPSrPM', src: 'afro' },
    { id: 'if-davido', artist: 'Davido', title: 'If', yt: 'helEv0kGHd4', yt2: 'fvZM0qrzz-g', src: 'afro' },
    { id: 'unavailable', artist: 'Davido', title: 'Unavailable', yt: 'OSBan_sH_b8', yt2: 'ZBnn_4v2PYM', src: 'afro' },
    { id: 'mnike', artist: 'Tyler ICU', title: 'Mnike', yt: 'g_hgm2Mf6Ag', yt2: '9sd8u5envTw', src: 'afro' },
    { id: 'temperature', artist: 'Sean Paul', title: 'Temperature', yt: 'dW2MmuA1nI4', yt2: '0M-7gAy5lBA', src: 'afro' },
    { id: 'get-busy', artist: 'Sean Paul', title: 'Get Busy', yt: 'oPQ3o14ksaM', yt2: 'HXceurkQcCs', src: 'afro' },

    /* ---- House / dancefloor (added Nov 20, 2026 — yt + yt2 verified) ---- */
    { id: 'show-me-love', artist: 'Robin S.', title: 'Show Me Love', yt: 'Ps2Jc28tQrw', yt2: 'LWDQxZE4dBs', src: 'house' },
    { id: 'finally-cece', artist: 'CeCe Peniston', title: 'Finally', yt: 'xk8mm1Qmt-Y', yt2: 'AJkJoSgCf18', src: 'house' },
    { id: 'gypsy-woman', artist: 'Crystal Waters', title: 'Gypsy Woman', yt: '_KztNIg4cvE', yt2: 'KHIgpxwdZfg', src: 'house' },
    { id: 'one-more-time', artist: 'Daft Punk', title: 'One More Time', yt: 'FGBhQbmPwH8', yt2: 'A2VpR8HahKc', src: 'house' },
    { id: 'get-lucky', artist: 'Daft Punk', title: 'Get Lucky', yt: 'CCHdMIEGaaM', yt2: '5NV6Rdv1a3I', src: 'house' },
    { id: 'i-feel-love', artist: 'Donna Summer', title: 'I Feel Love', yt: 'yEbaeLv-aOo', yt2: 'nTNcCKq6V2c', src: 'house' },
    { id: 'good-times-chic', artist: 'Chic', title: 'Good Times', yt: 'c3Hqy88oLIg', yt2: 'iGKQapswGaY', src: 'house' },
    { id: 'september', artist: 'Earth, Wind & Fire', title: 'September', yt: 'Gs069dndIYk', yt2: 'AWXub7E5moM', src: 'house' },
    { id: 'break-my-soul', artist: 'Beyoncé', title: 'Break My Soul', yt: 'iz1rIp1-b-Y', yt2: 'yjki-9Pthh0', src: 'house' },
    { id: 'levels', artist: 'Avicii', title: 'Levels', yt: '_ovdm2yX4MA', yt2: 'wDuoOapZ9Z0', src: 'house' },
    { id: 'latch', artist: 'Disclosure', title: 'Latch', yt: '93ASUImTedo', yt2: 'PFmQvhvaXiM', src: 'house' },

    /* ---- Women's headline anchors: soul / pop / R&B (added Nov 20, 2026 — yt + yt2 verified) ---- */
    { id: 'respect', artist: 'Aretha Franklin', title: 'Respect', yt: 'U0yIf9Tkgu4', yt2: 'JzqGZjFnYnA', src: 'queens' },
    { id: 'proud-mary', artist: 'Tina Turner', title: 'Proud Mary', yt: 'hX2MGrnRL7A', yt2: 'Gciy9oG5678', src: 'queens' },
    { id: 'single-ladies', artist: 'Beyoncé', title: 'Single Ladies (Put a Ring on It)', yt: '4m1EFMoRFvY', yt2: 'WJ75jGcGgPU', src: 'queens' },
    { id: 'umbrella', artist: 'Rihanna', title: 'Umbrella', yt: 'CvBfHwUxHIk', yt2: '5io69gNOTPk', src: 'queens' },
    { id: 'fantasy', artist: 'Mariah Carey', title: 'Fantasy', yt: 'qq09UkPRdFY', yt2: 'YH3oDeKXeSY', src: 'queens' },
    { id: 'the-boy-is-mine', artist: 'Brandy & Monica', title: 'The Boy Is Mine', yt: 'qSIOp_K5GMw', yt2: 'Sczq0lkmAdQ', src: 'queens' },
    { id: 'real-love', artist: 'Mary J. Blige', title: 'Real Love', yt: '90c9pEtZquw', yt2: 'OSmGu5LBs7E', src: 'queens' },

    /* ---- Party staples: Latin / gospel / HBCU / soul (added Nov 20, 2026 — yt + yt2 verified) ---- */
    { id: 'i-like-it', artist: 'Cardi B', title: 'I Like It', yt: 'xTlNMmZKwpA', yt2: 'U4fErC9skHE', src: 'party' },
    { id: 'gasolina', artist: 'Daddy Yankee', title: 'Gasolina', yt: 'CCF1_jI8Prk', yt2: 'GJP9ZTsgxJs', src: 'party' },
    { id: 'stomp', artist: 'Kirk Franklin', title: 'Stomp', yt: 'woxU-wfQFWw', yt2: 'TLQHxhaRNPI', src: 'party' },
    { id: 'swag-surfin', artist: 'F.L.Y.', title: "Swag Surfin'", yt: '7iTsbnr8e_8', yt2: 'qvzdJ6zNefM', src: 'party' },
    { id: 'sweet-love', artist: 'Anita Baker', title: 'Sweet Love', yt: '5Y9DYGiDL1o', yt2: 'pHE5EEePiGU', src: 'party' },
    /* ---- VERSUS catalogs round 3: Pusha T / Clipse + Lil Wayne (added Nov 20, 2026 — yt + yt2 verified) ---- */
    { id: 'grindin', artist: 'Clipse', title: "Grindin'", yt: 'TjWAWcx4xdE', yt2: 'ArgD6codGc0', src: 'versus3' },
    { id: 'when-the-last-time', artist: 'Clipse', title: 'When the Last Time', yt: 'd6VuYsNpYg8', yt2: 'kUfv5d5CIK4', src: 'versus3' },
    { id: 'mr-me-too', artist: 'Clipse', title: 'Mr. Me Too', yt: 'TdJjqApa3e0', yt2: 'FFZj_Srj4eU', src: 'versus3' },
    { id: 'wamp-wamp', artist: 'Clipse', title: 'Wamp Wamp (What It Do)', yt: 'mZ0iUNI0ncc', yt2: 'Bc9emob510I', src: 'versus3' },
    { id: 'kinda-like-a-big-deal', artist: 'Clipse', title: 'Kinda Like a Big Deal', yt: '3LD98c-9fGY', yt2: 'diEVUSBnNc8', src: 'versus3' },
    { id: 'popular-demand', artist: 'Clipse', title: 'Popular Demand (Popeyes)', yt: 's5DnESRMUs8', yt2: 'Md3TuQAZ-qM', src: 'versus3' },
    { id: 'numbers-on-the-boards', artist: 'Pusha T', title: 'Numbers on the Boards', yt: 'DawrlSwHUiM', yt2: 'vG3kIewysa0', src: 'versus3' },
    { id: 'nosetalgia', artist: 'Pusha T', title: 'Nosetalgia', yt: 'oRZniRLf23U', yt2: 'Qaxly5O9vNI', src: 'versus3' },
    { id: 'if-you-know-you-know', artist: 'Pusha T', title: 'If You Know You Know', yt: 'L7-0ugujS2U', yt2: 'kUK67HP8PvY', src: 'versus3' },
    { id: 'diet-coke', artist: 'Pusha T', title: 'Diet Coke', yt: '4FxPUMvfXbM', yt2: 'xmpdrI0xAZY', src: 'versus3' },
    { id: 'drug-dealers-anonymous', artist: 'Pusha T', title: 'Drug Dealers Anonymous', yt: 'tPp7dNDe00U', yt2: 'a2dwb025_OM', src: 'versus3' },
    { id: 'trouble-on-my-mind', artist: 'Pusha T', title: 'Trouble on My Mind', yt: '2GKL_ZoJQjc', yt2: 'x4htRLtOZfc', src: 'versus3' },
    { id: 'lollipop', artist: 'Lil Wayne', title: 'Lollipop', yt: '2IH8tNQAzSs', yt2: 'N1PCMETmaCM', src: 'versus3' },
    { id: 'go-dj', artist: 'Lil Wayne', title: 'Go DJ', yt: 'ZS8xVCFPIOo', yt2: 'g86lHRVI5JU', src: 'versus3' },
    { id: 'fireman', artist: 'Lil Wayne', title: 'Fireman', yt: '7y0ChoYgSek', yt2: 'LfkLe7CvLZc', src: 'versus3' },
    { id: '6-foot-7-foot', artist: 'Lil Wayne', title: '6 Foot 7 Foot', yt: 'c7tOAGY59uQ', yt2: 's5EnIIaEeQw', src: 'versus3' },
    { id: 'how-to-love', artist: 'Lil Wayne', title: 'How to Love', yt: 'y8Gf4-eT3w0', yt2: 'gcbGr3gkMoo', src: 'versus3' },
    { id: 'love-me-wayne', artist: 'Lil Wayne', title: 'Love Me', yt: 'uigygUVD_8E', yt2: 'KY44zvhWhp4', src: 'versus3' },
    { id: 'uproar', artist: 'Lil Wayne', title: 'Uproar', yt: '3XweJXvM9J8', yt2: 'qvNMJA7MQXc', src: 'versus3' },
    { id: 'mrs-officer', artist: 'Lil Wayne', title: 'Mrs. Officer', yt: 'MZbswo46zlI', yt2: 'UmM8RPKCrak', src: 'versus3' },
    { id: 'got-money', artist: 'Lil Wayne', title: 'Got Money', yt: '1ohYsK5Y8Dc', yt2: 'OMPjPCWRQWU', src: 'versus3' },
    { id: 'right-above-it', artist: 'Lil Wayne', title: 'Right Above It', yt: '-BDiIOglboY', yt2: 'b0wbCtrGjXA', src: 'versus3' },
    { id: 'mirror', artist: 'Lil Wayne', title: 'Mirror', yt: 'OZLUa8JUR18', yt2: 'hMjruqY3Hq8', src: 'versus3' },

    /* ---- VERSUS catalogs round 3: T.I. + Young Jeezy + Gucci Mane (added Nov 20, 2026 — yt + yt2 verified) ---- */
    { id: 'bring-em-out', artist: 'T.I.', title: "Bring 'Em Out", yt: 'UZckXxpGNa8', yt2: 'VuX_zwX3jPg', src: 'versus3' },
    { id: 'rubber-band-man', artist: 'T.I.', title: 'Rubber Band Man', yt: 'xjDT3rMSQLQ', yt2: 'JjDdzWZxDwc', src: 'versus3' },
    { id: 'u-dont-know-me', artist: 'T.I.', title: "U Don't Know Me", yt: 'z9H5_zDoBrU', yt2: 'WL-lErac8Cc', src: 'versus3' },
    { id: 'top-back', artist: 'T.I.', title: 'Top Back', yt: 'cqfZLAq2y-w', yt2: 'zSwGO2I-Wic', src: 'versus3' },
    { id: 'big-shit-poppin', artist: 'T.I.', title: "Big Shit Poppin' (Do It)", yt: 'uVMYFfBo3g8', yt2: 'cksewjmh8hM', src: 'versus3' },
    { id: 'whatever-you-like', artist: 'T.I.', title: 'Whatever You Like', yt: 'Kgdr2uytpDI', yt2: 'nQJACVmankY', src: 'versus3' },
    { id: 'live-your-life', artist: 'T.I.', title: 'Live Your Life', yt: 'koVHN6eO4Xg', yt2: 'uyFpoNQJk1s', src: 'versus3' },
    { id: 'dead-and-gone', artist: 'T.I.', title: 'Dead and Gone', yt: '6mEx9FtuN0k', yt2: 'OOXN61yZZsw', src: 'versus3' },
    { id: 'asap-ti', artist: 'T.I.', title: 'ASAP', yt: 'jwNYov2s3dI', yt2: 'A0sKlXFdm3c', src: 'versus3' },
    { id: 'no-mediocre', artist: 'T.I.', title: 'No Mediocre', yt: 'kUvvIkbP4ys', yt2: 'gBRnXcrqHwc', src: 'versus3' },
    { id: 'about-the-money', artist: 'T.I.', title: 'About the Money', yt: 'JHBnadmTReg', yt2: 'etfIdtm-OC8', src: 'versus3' },
    { id: 'put-on', artist: 'Young Jeezy', title: 'Put On', yt: '1aEImx74gLA', yt2: 'Z6mjjIJmg78', src: 'versus3' },
    { id: 'go-crazy', artist: 'Young Jeezy', title: 'Go Crazy', yt: 'iwLiTAlwXME', yt2: 'FgXBAnduGrc', src: 'versus3' },
    { id: 'i-luv-it', artist: 'Young Jeezy', title: 'I Luv It', yt: 'QUz3oB8wEGI', yt2: '369ERChW9js', src: 'versus3' },
    { id: 'go-getta', artist: 'Young Jeezy', title: 'Go Getta', yt: 'C7ec0VI4Yl0', yt2: 'OyyNAEIAyIg', src: 'versus3' },
    { id: 'my-president', artist: 'Young Jeezy', title: 'My President', yt: 'O9sABRosdNg', yt2: 'l3BvSeK4N0U', src: 'versus3' },
    { id: 'trap-star', artist: 'Young Jeezy', title: 'Trap Star', yt: 'bML7C51p59M', yt2: '0ccB6T6fb4I', src: 'versus3' },
    { id: 'and-then-what', artist: 'Young Jeezy', title: 'And Then What', yt: '_XhOKIHGH7Q', yt2: 'fC08BivCEac', src: 'versus3' },
    { id: 'lose-my-mind', artist: 'Young Jeezy', title: 'Lose My Mind', yt: '7jlMej_KGKc', yt2: '03lmnJHbfZ0', src: 'versus3' },
    { id: 'seen-it-all', artist: 'Young Jeezy', title: 'Seen It All', yt: 'FDuvoYoNMB4', yt2: 'JXuVlPq_5Pg', src: 'versus3' },
    { id: 'air-forces', artist: 'Young Jeezy', title: 'Air Forces', yt: '00l4a2fNL2o', yt2: '867ApEuM7IE', src: 'versus3' },
    { id: 'standing-ovation', artist: 'Young Jeezy', title: 'Standing Ovation', yt: 'OXPjktkesWQ', yt2: 'WrqSrpOfhWs', src: 'versus3' },
    { id: 'lemonade-gucci', artist: 'Gucci Mane', title: 'Lemonade', yt: 'H6Q4s_ZdvAQ', yt2: 't-VmWl9iU3s', src: 'versus3' },
    { id: 'wasted-gucci', artist: 'Gucci Mane', title: 'Wasted', yt: '7wBOiO5ptJk', yt2: 'VdTIW2Fq3S0', src: 'versus3' },
    { id: 'freaky-gurl', artist: 'Gucci Mane', title: 'Freaky Gurl', yt: 'P653nyX1quQ', yt2: 'uIMaYajamyw', src: 'versus3' },
    { id: 'i-think-i-love-her', artist: 'Gucci Mane', title: 'I Think I Love Her', yt: 'gtumYwv0YYo', yt2: 'TiAhm5K7MQQ', src: 'versus3' },
    { id: 'spotlight-gucci', artist: 'Gucci Mane', title: 'Spotlight', yt: '1CQZDiko2xg', yt2: 'pGkT1Hbd9hQ', src: 'versus3' },
    { id: 'wake-up-in-the-sky', artist: 'Gucci Mane', title: 'Wake Up in the Sky', yt: 'U68MJz9DrI4', yt2: 'bS1Nf0syICc', src: 'versus3' },
    { id: 'i-get-the-bag', artist: 'Gucci Mane', title: 'I Get the Bag', yt: 'uo14xGYwWd4', yt2: 'JNqN6qznE1k', src: 'versus3' },
    { id: 'both-gucci', artist: 'Gucci Mane', title: 'Both', yt: 'eu1AHz4MV2g', yt2: 'ZeNwB4lNojs', src: 'versus3' },
    { id: 'curve-gucci', artist: 'Gucci Mane', title: 'Curve', yt: 'kZWaxBaPgP8', yt2: '1XW2cCp6AI8', src: 'versus3' },
    { id: 'first-day-out', artist: 'Gucci Mane', title: 'First Day Out Tha Feds', yt: 'i9kJJ9yhXNc', yt2: 'x0wHwxejzrM', src: 'versus3' },
    { id: 'tone-it-down', artist: 'Gucci Mane', title: 'Tone It Down', yt: '5iEU-nj_BsE', yt2: 'mkpxfoPqLLs', src: 'versus3' },
    { id: 'rumors-gucci', artist: 'Gucci Mane', title: 'Rumors', yt: 'QVn1DGgqBNo', yt2: '4NJVe_68UgQ', src: 'versus3' },

    /* ---- VERSUS catalogs round 3: Beyoncé + Rihanna + Nicki Minaj + Cardi B (added Nov 20, 2026 — yt + yt2 verified) ---- */
    { id: 'irreplaceable', artist: 'Beyoncé', title: 'Irreplaceable', yt: 'Rb7sVoMYuFc', yt2: 'H48vxEPH99o', src: 'versus3' },
    { id: 'halo', artist: 'Beyoncé', title: 'Halo', yt: 'aIz8j4EH3Ik', yt2: 'bnVUHWCynig', src: 'versus3' },
    { id: 'love-on-top', artist: 'Beyoncé', title: 'Love on Top', yt: 'Ob7vObnFUJc', yt2: 'HzC9X_O7bJQ', src: 'versus3' },
    { id: 'formation', artist: 'Beyoncé', title: 'Formation', yt: 'WDZJPJV__bQ', yt2: 'hG2D1fvEwI0', src: 'versus3' },
    { id: 'drunk-in-love', artist: 'Beyoncé', title: 'Drunk in Love', yt: 'p1JPKLa-Ofc', yt2: 'BroIjAi27f4', src: 'versus3' },
    { id: 'partition', artist: 'Beyoncé', title: 'Partition', yt: 'm7k6Q7A8YC8', yt2: 'YDhyybGLsow', src: 'versus3' },
    { id: 'baby-boy', artist: 'Beyoncé', title: 'Baby Boy', yt: 'g_-1amWFYvg', yt2: '8ucz_pm3LX8', src: 'versus3' },
    { id: 'pon-de-replay', artist: 'Rihanna', title: 'Pon de Replay', yt: 'Hzj_NAWUn5U', yt2: 'VqsZxoBR77M', src: 'versus3' },
    { id: 'sos-rihanna', artist: 'Rihanna', title: 'SOS', yt: 'IXmF4GbA86E', yt2: 'lpm5pcCC_-Q', src: 'versus3' },
    { id: 'disturbia', artist: 'Rihanna', title: 'Disturbia', yt: '3k95KCjTrYo', yt2: 'Pecfa_6EJP4', src: 'versus3' },
    { id: 'rude-boy', artist: 'Rihanna', title: 'Rude Boy', yt: 'hzHeMHUxpgw', yt2: '_kuOzgsYTMk', src: 'versus3' },
    { id: 'only-girl', artist: 'Rihanna', title: 'Only Girl (In the World)', yt: '-ySWIyJj3I0', yt2: 'oRiVQOD1Mx0', src: 'versus3' },
    { id: 'we-found-love', artist: 'Rihanna', title: 'We Found Love', yt: 'p7g6MDQeo08', yt2: 'tYNSSQ2RuJU', src: 'versus3' },
    { id: 'diamonds', artist: 'Rihanna', title: 'Diamonds', yt: 'LyKYV_7vs6k', yt2: 'kOGBIbqXwYE', src: 'versus3' },
    { id: 'stay-rihanna', artist: 'Rihanna', title: 'Stay', yt: 'Qzo6zVd1Lik', yt2: 'Ke4TIPCLHfc', src: 'versus3' },
    { id: 'needed-me', artist: 'Rihanna', title: 'Needed Me', yt: '6nIqciTxd-s', yt2: 'fMroUNstfMA', src: 'versus3' },
    { id: 'love-on-the-brain', artist: 'Rihanna', title: 'Love on the Brain', yt: 'eiNV4eWYpxU', yt2: 'Sn2-xMlFKa0', src: 'versus3' },
    { id: 'anaconda', artist: 'Nicki Minaj', title: 'Anaconda', yt: 'LDZX4ooRsWs', yt2: '_z-nJt0h930', src: 'versus3' },
    { id: 'starships', artist: 'Nicki Minaj', title: 'Starships', yt: 'SeIJmciN8mo', yt2: 'WPGaXJlaK9Y', src: 'versus3' },
    { id: 'pound-the-alarm', artist: 'Nicki Minaj', title: 'Pound the Alarm', yt: 'vlgoOnaFBHE', yt2: '5I3PfIebzl0', src: 'versus3' },
    { id: 'moment-4-life', artist: 'Nicki Minaj', title: 'Moment 4 Life', yt: 'Ks3_kuRAzHs', yt2: 'D7GW8TYCEG4', src: 'versus3' },
    { id: 'your-love-nicki', artist: 'Nicki Minaj', title: 'Your Love', yt: 'pSFyrrhKj1Q', yt2: 'JUDIcU2NFJM', src: 'versus3' },
    { id: 'fly-nicki', artist: 'Nicki Minaj', title: 'Fly', yt: 'Hb2aR-P9oe4', yt2: '2TUBNb3B6qQ', src: 'versus3' },
    { id: 'beez-in-the-trap', artist: 'Nicki Minaj', title: 'Beez in the Trap', yt: '7BPthwdwg2k', yt2: 'EmZvOhHF85I', src: 'versus3' },
    { id: 'chun-li', artist: 'Nicki Minaj', title: 'Chun-Li', yt: 'hHl2v9l6CFQ', yt2: 'AIwpiaOhVkQ', src: 'versus3' },
    { id: 'super-freaky-girl', artist: 'Nicki Minaj', title: 'Super Freaky Girl', yt: 'j5uAR9w7LBg', yt2: '_RRjxHWA338', src: 'versus3' },
    { id: 'barbie-dreams', artist: 'Nicki Minaj', title: 'Barbie Dreams', yt: 'rd5Z_ZNfVgA', yt2: 'udIS_QrG2pE', src: 'versus3' },
    { id: 'good-form', artist: 'Nicki Minaj', title: 'Good Form', yt: 'OG4PTRWr530', yt2: '6vI1I7-rp5I', src: 'versus3' },
    { id: 'bodak-yellow', artist: 'Cardi B', title: 'Bodak Yellow', yt: 'PEGccV-NOm8', yt2: 'lnJG3mQxEqg', src: 'versus3' },
    { id: 'money-cardi', artist: 'Cardi B', title: 'Money', yt: 'zUOh09GoQgk', yt2: 'pmHprsXryjM', src: 'versus3' },
    { id: 'press-cardi', artist: 'Cardi B', title: 'Press', yt: 'cJc7xWJbwJw', yt2: 'gELIWl-h9bA', src: 'versus3' },
    { id: 'be-careful', artist: 'Cardi B', title: 'Be Careful', yt: '8zSRkr1nQNw', yt2: 'l3uG4T8pJfw', src: 'versus3' },
    { id: 'ring-cardi', artist: 'Cardi B', title: 'Ring', yt: 'kcRWyLMVrFM', yt2: 'KMPhg7hMgZw', src: 'versus3' },
    { id: 'bartier-cardi', artist: 'Cardi B', title: 'Bartier Cardi', yt: 'hXnMSaK6C2w', yt2: 'jqDxNMLIkHs', src: 'versus3' },
    { id: 'finesse-remix', artist: 'Bruno Mars & Cardi B', title: 'Finesse (Remix)', yt: 'LsoLEjrDogU', yt2: 'SL-4FXHatvA', src: 'versus3' },
    { id: 'no-limit', artist: 'G-Eazy ft. Cardi B', title: 'No Limit', yt: 'PGfSaVDymjk', yt2: 'l_lblj8Cq0o', src: 'versus3' },

    /* ---- VERSUS catalogs round 3: Brandy + Monica + Mariah Carey + Whitney Houston (added Nov 20, 2026 — yt + yt2 verified) ---- */
    { id: 'i-wanna-be-down', artist: 'Brandy', title: 'I Wanna Be Down', yt: 'PzpLkcfBe-A', yt2: 'zfE2gBhwsM4', src: 'versus3' },
    { id: 'baby-brandy', artist: 'Brandy', title: 'Baby', yt: 'zJzMlOXwOto', yt2: 'LmYJNI-ciSs', src: 'versus3' },
    { id: 'best-friend-brandy', artist: 'Brandy', title: 'Best Friend', yt: 'gFMdIj2UPRk', yt2: 'YNWyoE75Xyc', src: 'versus3' },
    { id: 'sittin-up-in-my-room', artist: 'Brandy', title: "Sittin' Up in My Room", yt: 'yge2PqEZZJo', yt2: 'g9-Itzi9JrU', src: 'versus3' },
    { id: 'have-you-ever', artist: 'Brandy', title: 'Have You Ever?', yt: 'Xkj1An6Wnec', yt2: 'to7LDqRd4DM', src: 'versus3' },
    { id: 'almost-doesnt-count', artist: 'Brandy', title: "Almost Doesn't Count", yt: 'is9b77WXqmY', yt2: 'DDll4GHBacg', src: 'versus3' },
    { id: 'full-moon', artist: 'Brandy', title: 'Full Moon', yt: 'T5WND4daNuM', yt2: 'qWcBooIbNeI', src: 'versus3' },
    { id: 'what-about-us', artist: 'Brandy', title: 'What About Us?', yt: '7sgajU9F2T0', yt2: 'GN3QkEXFBfQ', src: 'versus3' },
    { id: 'afrodisiac', artist: 'Brandy', title: 'Afrodisiac', yt: 'vYH6Sw3A-BA', yt2: 'eVp2iyyPs7k', src: 'versus3' },
    { id: 'brokenhearted', artist: 'Brandy', title: 'Brokenhearted', yt: 'wJlNPk_YVHA', yt2: 'Uzgv3xD5Dt4', src: 'versus3' },
    { id: 'put-it-down', artist: 'Brandy', title: 'Put It Down', yt: 'E5svXAZ9-Qk', yt2: 'vTO0GJFYH1k', src: 'versus3' },
    { id: 'dont-take-it-personal', artist: 'Monica', title: "Don't Take It Personal", yt: 'asXau88O5Is', yt2: 'o2sG4NXq_wM', src: 'versus3' },
    { id: 'before-you-walk-out', artist: 'Monica', title: 'Before You Walk Out of My Life', yt: 'Ptiz0KtR16E', yt2: 'eLzxvYW6hXs', src: 'versus3' },
    { id: 'why-i-love-you-so-much', artist: 'Monica', title: 'Why I Love You So Much', yt: 'qFRCPLAvxnM', yt2: 'MeB4M-1iEyI', src: 'versus3' },
    { id: 'for-you-i-will', artist: 'Monica', title: 'For You I Will', yt: 'qLnoYEAoJ-M', yt2: 'qWHCNieTMg8', src: 'versus3' },
    { id: 'the-first-night', artist: 'Monica', title: 'The First Night', yt: 'ImynIRpbQLE', yt2: 'qoPjzNZAxCs', src: 'versus3' },
    { id: 'angel-of-mine', artist: 'Monica', title: 'Angel of Mine', yt: '3eOuK-pYhy4', yt2: 'PsUsWZduiLc', src: 'versus3' },
    { id: 'so-gone', artist: 'Monica', title: 'So Gone', yt: 'UE6zfOuYfVI', yt2: 'y5DCf80rkVc', src: 'versus3' },
    { id: 'u-shouldve-known-better', artist: 'Monica', title: "U Should've Known Better", yt: 'daPJTxuY7G8', yt2: 'ABYqM5jl3yY', src: 'versus3' },
    { id: 'everything-to-me', artist: 'Monica', title: 'Everything to Me', yt: 'pqe93Bct7UU', yt2: 'ayE5Tsa_DmE', src: 'versus3' },
    { id: 'love-all-over-me', artist: 'Monica', title: 'Love All Over Me', yt: 'arCTOMGT9do', yt2: 'w1AKYdC5IVM', src: 'versus3' },
    { id: 'still-standing', artist: 'Monica', title: 'Still Standing', yt: 'ubTUZtFVN9E', yt2: 'VN2V-QB62Nc', src: 'versus3' },
    { id: 'until-its-gone', artist: 'Monica', title: "Until It's Gone", yt: 'awHY-IRGu8U', yt2: 'R_SYNaJlLIQ', src: 'versus3' },
    { id: 'vision-of-love', artist: 'Mariah Carey', title: 'Vision of Love', yt: 'QiuwpIrO6-k', yt2: 'tov22NtCMC4', src: 'versus3' },
    { id: 'emotions', artist: 'Mariah Carey', title: 'Emotions', yt: 'vfWRijbVO_k', yt2: '70pqzhqJRqk', src: 'versus3' },
    { id: 'dreamlover', artist: 'Mariah Carey', title: 'Dreamlover', yt: 'CqBtS6BIP1E', yt2: 'uikbCArtxRI', src: 'versus3' },
    { id: 'hero', artist: 'Mariah Carey', title: 'Hero', yt: 'hgXw9YHpk1M', yt2: 'u21TsBONu_I', src: 'versus3' },
    { id: 'always-be-my-baby', artist: 'Mariah Carey', title: 'Always Be My Baby', yt: 'LfRNRymrv9k', yt2: 'vmGZnzF3AdI', src: 'versus3' },
    { id: 'honey-mariah', artist: 'Mariah Carey', title: 'Honey', yt: 'vCfkxUVkH7Q', yt2: 'oZL8p3EMEGE', src: 'versus3' },
    { id: 'heartbreaker', artist: 'Mariah Carey', title: 'Heartbreaker', yt: 'GloaI5VWVMc', yt2: 'ci1QdHIaKso', src: 'versus3' },
    { id: 'we-belong-together', artist: 'Mariah Carey', title: 'We Belong Together', yt: '0habxsuXW4g', yt2: '9bvuftmnzuM', src: 'versus3' },
    { id: 'shake-it-off', artist: 'Mariah Carey', title: 'Shake It Off', yt: 'jZVdDl_asYY', yt2: 'TxZAdGk9OHw', src: 'versus3' },
    { id: 'touch-my-body', artist: 'Mariah Carey', title: 'Touch My Body', yt: '9b8erWuBA44', yt2: 'WoKCwdbxriw', src: 'versus3' },
    { id: 'obsessed', artist: 'Mariah Carey', title: 'Obsessed', yt: 'H1Yt0xJKDY8', yt2: 'e7HO62Hmkg4', src: 'versus3' },
    { id: 'how-will-i-know', artist: 'Whitney Houston', title: 'How Will I Know', yt: 'zr3SvOR2rFc', yt2: '7kphJqTLZXc', src: 'versus3' },
    { id: 'greatest-love-of-all', artist: 'Whitney Houston', title: 'Greatest Love of All', yt: 'IYzlVDlE72w', yt2: 'KrPpYbI8L1U', src: 'versus3' },
    { id: 'im-your-baby-tonight', artist: 'Whitney Houston', title: "I'm Your Baby Tonight", yt: 'i0oRnyXxIrY', yt2: '0H-jLOoz-YY', src: 'versus3' },
    { id: 'i-will-always-love-you', artist: 'Whitney Houston', title: 'I Will Always Love You', yt: 'T9Ybsvw_0p4', yt2: 'aVGHr_9UVMg', src: 'versus3' },
    { id: 'exhale', artist: 'Whitney Houston', title: 'Exhale (Shoop Shoop)', yt: '8jxuKCK1jOQ', yt2: 'ySJRpiqAHDY', src: 'versus3' },
    { id: 'my-love-is-your-love', artist: 'Whitney Houston', title: 'My Love Is Your Love', yt: 'kxZD0VQvfqU', yt2: 'xxpbQ01bv3k', src: 'versus3' },
    { id: 'its-not-right-but-its-okay', artist: 'Whitney Houston', title: "It's Not Right but It's Okay", yt: '6J538b-OLRU', yt2: 'llCU_VwfJc4', src: 'versus3' },
    { id: 'heartbreak-hotel', artist: 'Whitney Houston', title: 'Heartbreak Hotel', yt: 'xEmdW3_bi4c', yt2: 'zvUjZMiborY', src: 'versus3' },
    { id: 'when-you-believe', artist: 'Whitney Houston & Mariah Carey', title: 'When You Believe', yt: 'LKaXY4IdZ40', yt2: 'SO1MFZCkOec', src: 'versus3' },
    { id: 'million-dollar-bill', artist: 'Whitney Houston', title: 'Million Dollar Bill', yt: 'wNIcVTmUSOU', yt2: 'F1XF4KOX2Oo', src: 'versus3' },
    { id: 'all-the-man-that-i-need', artist: 'Whitney Houston', title: 'All the Man That I Need', yt: 'dJN2-jDhLbg', yt2: 'dx5Tm6hj6Pk', src: 'versus3' },

    /* ---- VERSUS catalogs round 3: Mary J. Blige + Faith Evans (added Nov 20, 2026 — yt + yt2 verified) ---- */
    { id: 'you-remind-me', artist: 'Mary J. Blige', title: 'You Remind Me', yt: 'Nia2C6JW4VU', yt2: 'meTs9NO12uA', src: 'versus3' },
    { id: 'im-goin-down', artist: 'Mary J. Blige', title: "I'm Goin' Down", yt: '1XmwiwQjU8E', yt2: '9KemcFoMRPA', src: 'versus3' },
    { id: 'not-gon-cry', artist: 'Mary J. Blige', title: "Not Gon' Cry", yt: 'Xxk4e59M8og', yt2: '6r9NTrWEW5Y', src: 'versus3' },
    { id: 'be-without-you', artist: 'Mary J. Blige', title: 'Be Without You', yt: '8XNaPX6MKlU', yt2: 'avFlhGhDgzA', src: 'versus3' },
    { id: 'just-fine', artist: 'Mary J. Blige', title: 'Just Fine', yt: 'G6ZjBPXSmnE', yt2: '0Hl9MxHt0yQ', src: 'versus3' },
    { id: 'mr-wrong', artist: 'Mary J. Blige', title: 'Mr. Wrong', yt: 'eS-y2R9cmnQ', yt2: 'KXPjaZql8c8', src: 'versus3' },
    { id: 'enough-cryin', artist: 'Mary J. Blige', title: 'Enough Cryin', yt: 'tGFYlCqASpY', yt2: 'OGHnHqBw8Wc', src: 'versus3' },
    { id: 'i-can-love-you', artist: 'Mary J. Blige', title: 'I Can Love You', yt: 'tSQCvb-UEH0', yt2: 'SBmgd-AR9Bg', src: 'versus3' },
    { id: 'take-me-as-i-am', artist: 'Mary J. Blige', title: 'Take Me As I Am', yt: 'NzNiE3ZUHdk', yt2: 'VXJ8uTXq9Zc', src: 'versus3' },
    { id: 'love-at-1st-sight', artist: 'Mary J. Blige', title: 'Love @ 1st Sight', yt: 'WWQDNSgYB7E', yt2: 'Xv7ajvuhp1U', src: 'versus3' },
    { id: 'you-used-to-love-me', artist: 'Faith Evans', title: 'You Used to Love Me', yt: 'Vc8sR60pwtA', yt2: '-zEBLIJrnFg', src: 'versus3' },
    { id: 'soon-as-i-get-home', artist: 'Faith Evans', title: 'Soon As I Get Home', yt: 'ylB0BIVS20U', yt2: 'mOGI4ZdoTik', src: 'versus3' },
    { id: 'aint-nobody-faith', artist: 'Faith Evans', title: "Ain't Nobody", yt: 'SkLc5dG9SSw', yt2: 'HBUiASa0jPU', src: 'versus3' },
    { id: 'love-like-this', artist: 'Faith Evans', title: 'Love Like This', yt: 'w1QzBQKYbag', yt2: 'mYGoi7NmOec', src: 'versus3' },
    { id: 'i-love-you-faith', artist: 'Faith Evans', title: 'I Love You', yt: 'ybToZTdi8ak', yt2: 'VLsoMo-EsvQ', src: 'versus3' },
    { id: 'never-gonna-let-you-go', artist: 'Faith Evans', title: 'Never Gonna Let You Go', yt: 'KqR7SebhPEs', yt2: 'mimUzDS7SKI', src: 'versus3' },
    { id: 'burnin-up-faith', artist: 'Faith Evans', title: "Burnin' Up", yt: 'e9E0z1azwS4', yt2: '3X783r11h0Y', src: 'versus3' },
    { id: 'you-gets-no-love', artist: 'Faith Evans', title: 'You Gets No Love', yt: 'QcIE97knIjs', yt2: 'VdGaD3SXueA', src: 'versus3' },
    { id: 'cant-believe-faith', artist: 'Faith Evans', title: "Can't Believe", yt: 't9061pGWYLM', yt2: 'LrwxORS2WRE', src: 'versus3' },
    { id: 'mesmerized', artist: 'Faith Evans', title: 'Mesmerized', yt: 'dTDtEjstff4', yt2: 'fyUUoOqEkVw', src: 'versus3' },
    { id: 'again-faith', artist: 'Faith Evans', title: 'Again', yt: 'pIHPJXvCxvw', yt2: '4XGHh7l3ul8', src: 'versus3' },
    { id: 'ill-be-missing-you', artist: 'Puff Daddy & Faith Evans', title: "I'll Be Missing You", yt: 'NKMtZm2YuBE', yt2: 'W9OjkHJdQJ4', src: 'versus3' },

    /* ---- VERSUS catalogs round 4: Michael Jackson + Prince (added Nov 22, 2026 — yt + yt2 verified) ---- */
    { id: 'billie-jean', artist: 'Michael Jackson', title: 'Billie Jean', yt: 'Zi_XLOBDo_Y', yt2: 'Kr4EQDVETuA', src: 'versus4' },
    { id: 'beat-it', artist: 'Michael Jackson', title: 'Beat It', yt: 'oRdxUFDoQe0', yt2: 'n0su-7oBgP8', src: 'versus4' },
    { id: 'thriller', artist: 'Michael Jackson', title: 'Thriller', yt: '4V90AmXnguw', yt2: 'sO4vI8P88NM', src: 'versus4' },
    { id: 'smooth-criminal', artist: 'Michael Jackson', title: 'Smooth Criminal', yt: 'h_D3VFfhvs4', yt2: '_mMyPJSx8RU', src: 'versus4' },
    { id: 'black-or-white', artist: 'Michael Jackson', title: 'Black or White', yt: 'F2AitTPI5U0', yt2: '83CgidmTXMc', src: 'versus4' },
    { id: 'the-way-you-make-me-feel', artist: 'Michael Jackson', title: 'The Way You Make Me Feel', yt: 'HzZ_urpj4As', yt2: 'VtM-rHPwN7o', src: 'versus4' },
    { id: 'man-in-the-mirror', artist: 'Michael Jackson', title: 'Man in the Mirror', yt: 'PivWY9wn5ps', yt2: 'Z9NYDgbKsBE', src: 'versus4' },
    { id: 'dont-stop-til-you-get-enough', artist: 'Michael Jackson', title: 'Don\'t Stop \'Til You Get Enough', yt: 'yURRmWtbTbo', yt2: 'LUDvEcNU2l0', src: 'versus4' },
    { id: 'rock-with-you', artist: 'Michael Jackson', title: 'Rock with You', yt: '5X-Mrc2l1d0', yt2: 'aCjxP58Ydik', src: 'versus4' },
    { id: 'wanna-be-startin-somethin', artist: 'Michael Jackson', title: 'Wanna Be Startin\' Somethin\'', yt: '1XMvPTFzgVU', yt2: 'DsJlttdkybk', src: 'versus4' },
    { id: 'pyt', artist: 'Michael Jackson', title: 'P.Y.T. (Pretty Young Thing)', yt: '1ZZQuj6htF4', yt2: '_GlgOkBR1vU', src: 'versus4' },
    { id: 'remember-the-time', artist: 'Michael Jackson', title: 'Remember the Time', yt: 'LeiFF0gvqcc', yt2: 'qM19eRgOK1Q', src: 'versus4' },
    { id: 'purple-rain', artist: 'Prince', title: 'Purple Rain', yt: 'uW1UIDYmYyI', yt2: 'iSBVeZrDfGY', src: 'versus4' },
    { id: 'when-doves-cry', artist: 'Prince', title: 'When Doves Cry', yt: 'UG3VcCAlUgE', yt2: 'IUc0R8bbWQE', src: 'versus4' },
    { id: 'kiss-prince', artist: 'Prince', title: 'Kiss', yt: 'H9tEvfIsDyo', yt2: '-a9kOCHYZIw', src: 'versus4' },
    { id: 'little-red-corvette', artist: 'Prince', title: 'Little Red Corvette', yt: 'v0KpfrJE4zw', yt2: 'D_2a_a2j5jc', src: 'versus4' },
    { id: '1999-prince', artist: 'Prince', title: '1999', yt: 'rblt2EtFfC4', yt2: 'UWC4X_rTRsA', src: 'versus4' },
    { id: 'raspberry-beret', artist: 'Prince', title: 'Raspberry Beret', yt: 'l7vRSu_wsNc', yt2: '7rlK4CD60ZY', src: 'versus4' },
    { id: 'i-wanna-be-your-lover', artist: 'Prince', title: 'I Wanna Be Your Lover', yt: 'Rp8WL621uGM', yt2: 'nzbOY4mGIug', src: 'versus4' },
    { id: 'i-would-die-4-u', artist: 'Prince', title: 'I Would Die 4 U', yt: 'SVEFRQavTNI', yt2: 'rjspOZHIRE4', src: 'versus4' },
    { id: 'cream-prince', artist: 'Prince', title: 'Cream', yt: 'rrbFQEcpJ3A', yt2: 'MRLUooLDLgo', src: 'versus4' },
    { id: 'u-got-the-look', artist: 'Prince', title: 'U Got the Look', yt: '_jCuroTbqBI', yt2: 'iUgMp4JhHXc', src: 'versus4' },
    { id: 'most-beautiful-girl', artist: 'Prince', title: 'The Most Beautiful Girl in the World', yt: 'FuXbKLiW1UI', yt2: 'QJuTytASlUo', src: 'versus4' },
    { id: 'gett-off', artist: 'Prince', title: 'Gett Off', yt: '6f4BwQFF-Os', yt2: 'N0xNVmiamak', src: 'versus4' },

    /* ---- VERSUS catalogs round 4: J. Cole + Kendrick Lamar (added Nov 22, 2026 — yt + yt2 verified) ---- */
    { id: 'work-out', artist: 'J. Cole', title: 'Work Out', yt: 'W5hSdGt2M8w', yt2: 'db-cKHE8dqQ', src: 'versus4' },
    { id: 'power-trip', artist: 'J. Cole', title: 'Power Trip', yt: '7AjD7nKiUQ4', yt2: 'VMeirNg87AY', src: 'versus4' },
    { id: 'crooked-smile', artist: 'J. Cole', title: 'Crooked Smile', yt: 'fzzMOMkjm8A', yt2: '2KK_Mxbc91I', src: 'versus4' },
    { id: 'apparently', artist: 'J. Cole', title: 'Apparently', yt: 'eRaFMlZ1YHA', yt2: '98j39T5mrAk', src: 'versus4' },
    { id: 'wet-dreamz', artist: 'J. Cole', title: 'Wet Dreamz', yt: 'eCGV26aj-mM', yt2: 'lTgvsJY4aYE', src: 'versus4' },
    { id: 'middle-child', artist: 'J. Cole', title: 'Middle Child', yt: 'WILNIXZr2oc', yt2: 'e8CLsYzE5wk', src: 'versus4' },
    { id: 'love-yourz', artist: 'J. Cole', title: 'Love Yourz', yt: '6tjlU4w4fSo', yt2: 'lki42lbKT9s', src: 'versus4' },
    { id: 'gomd', artist: 'J. Cole', title: 'G.O.M.D.', yt: 'vHU6ZRQJ50Q', yt2: '4d_KpQ6npNA', src: 'versus4' },
    { id: 'deja-vu', artist: 'J. Cole', title: 'Deja Vu', yt: 'QN8ssSHzGwU', yt2: 'fp7v57ywiWs', src: 'versus4' },
    { id: 'neighbors', artist: 'J. Cole', title: 'Neighbors', yt: '9nfVWiXY3WY', yt2: '1DhYVci-6ow', src: 'versus4' },
    { id: 'a-tale-of-2-citiez', artist: 'J. Cole', title: 'A Tale of 2 Citiez', yt: 'bFewu1ATBFs', yt2: '9G50f69eLCg', src: 'versus4' },
    { id: 'all-the-stars', artist: 'Kendrick Lamar & SZA', title: 'All the Stars', yt: 'JQbjS0_ZfJ0', yt2: 'J8XXsisgH1s', src: 'versus4' },

    /* ---- Round 4 pool staples: party / pop (added Nov 22, 2026 — yt + yt2 verified) ---- */
    { id: 'hot-in-herre', artist: 'Nelly', title: 'Hot in Herre', yt: 'GeZZr_p6vB8', yt2: 'y8vLMHeO_5s', src: 'round4' },
    { id: 'party-up', artist: 'DMX', title: 'Party Up (Up in Here)', yt: 'thIVtEOtlWM', yt2: 'XGgV3LsnDWg', src: 'round4' },
    { id: 'blinding-lights', artist: 'The Weeknd', title: 'Blinding Lights', yt: '4NRXx6U8ABQ', yt2: 'fHI8X4OXluQ', src: 'round4' },
    { id: 'levitating', artist: 'Dua Lipa', title: 'Levitating', yt: 'TUVcZfQe-Kw', yt2: 'WHuBW3qKm9g', src: 'round4' },
  ];

  var SONG_MAP = {};
  SONGS.forEach(function (s) { SONG_MAP[s.id] = s; });

  function starterIds() {
    return SONGS.filter(function (s) { return s.src === 'starter' || s.src === 'both'; })
                .map(function (s) { return s.id; });
  }

  /* ------------------------------------------------------------------ */
  /* Decks. A deck is a themed subset of the pool (>= 24 unique songs)   */
  /* with its own shuffled call order at game time. Songs may be reused  */
  /* across decks.                                                       */
  /* ------------------------------------------------------------------ */
  var DECKS = [
    {
      id: 'after-spot-starter',
      name: 'After Spot Starter',
      tagline: 'The original VIP card — the 24 from the screenshots.',
      songs: starterIds()
    },
    {
      id: 'winners-circle',
      name: 'Winners Circle',
      tagline: 'Winners Circle Night — nothing but the biggest records. If the whole room doesn\'t know it, it didn\'t make the card.',
      songs: ['uptown-funk', 'i-wanna-dance', 'crazy-in-love', 'hey-ya', 'yeah',
        'no-scrubs', 'super-bass', 'a-milli', 'cuff-it', 'kill-bill', 'up',
        'work', 'nice-for-what', 'family-affair', 'buy-u-a-drank', 'one-two-step',
        'rock-the-boat', 'bad-and-boujee', 'hotline-bling', 'humble',
        'sicko-mode', 'wap', 'the-box', 'savage', 'gods-plan', 'not-like-us', 'september', 'umbrella',
        'single-ladies', 'old-town-road', 'respect', 'i-like-it']
    },
    {
      id: 'hip-hop-heat',
      name: 'Hip-Hop Heat',
      tagline: 'Rap heavy hitters only.',
      songs: ['a-milli', 'up', 'wap', 'humble', 'mask-off', 'bad-and-boujee',
        'no-flockin', 'sicko-mode', 'the-box', 'rockstar-dababy', 'rockstar-post',
        'whats-poppin', 'pop-out', 'shotta-flow', 'said-sum', 'drip-too-hard',
        'pushin-p', 'tick-tock', 'xo-tour-llif3', 'hotline-bling', 'nice-for-what',
        'tomorrow-2', 'big-energy', 'savage', 'gods-plan', 'not-like-us', 'dna', 'alright',
        'fkin-problems', 'swag-surfin', 'money-trees', 'swimming-pools']
    },
    {
      id: 'rnb-ladies-night',
      name: 'R&B Ladies Night',
      tagline: 'Ladies Night — the queens run the room. R&B royalty + the smooth slow-burners.',
      songs: ['cuff-it', 'crazy-in-love', 'work', 'rock-the-boat', 'no-scrubs',
        'family-affair', 'kill-bill', 'good-days', 'playing-games', 'exchange',
        'gravity', 'roll-some-mo', 'focus', 'none-of-your-concern',
        'heartbreak-anniversary', 'leave-the-door-open', 'say-so', 'need-to-know',
        'never-too-much', 'i-wanna-dance', 'super-bass', 'yeah', 'come-down',
        'slow-down', 'umbrella', 'fantasy', 'real-love', 'the-boy-is-mine',
        'single-ladies', 'respect', 'sweet-love']
    },
    {
      id: 'old-school-hip-hop',
      name: 'Old School Hip Hop',
      tagline: 'Old School Hip Hop Night — the real golden era. Run-DMC, Beastie Boys and LL Cool J up front, then the early-90s pillars. Every record on this card is 1986–1998.',
      songs: ['walk-this-way', 'fight-for-your-right', 'mama-said-knock-you-out',
        'around-the-way-girl', 'shoop', 'unity', 'scenario', 'u-cant-touch-this',
        'ice-ice-baby', 'baby-got-back', 'jump-around', 'nuthin-but-a-g-thang',
        'it-was-a-good-day', 'juicy', 'gin-and-juice', 'regulate', 'cream',
        'insane-in-the-brain', 'california-love', 'tha-crossroads',
        'hip-hop-hooray', 'hard-knock-life', 'ruff-ryders-anthem', 'no-diggity']
    },
    {
      id: 'old-school-classics',
      name: 'Old School Classics',
      tagline: 'Throwbacks first — the pool skews modern, see STORE-NOTES.',
      songs: ['never-too-much', 'i-wanna-dance', 'no-scrubs', 'rock-the-boat',
        'crazy-in-love', 'yeah', 'one-two-step', 'hey-ya', 'family-affair',
        'aston-martin-music', 'a-milli', 'super-bass', 'no-role-modelz',
        'hotline-bling', 'exchange', 'the-need-to-know', 'one-man', 'come-down',
        'no-problem', 'mask-off', 'xo-tour-llif3', 'humble', 'rockstar-post',
        'work', 'respect', 'proud-mary', 'september', 'good-times-chic']
    },
    {
      id: 'famu-rattlers',
      name: 'FAMU Rattlers',
      tagline: 'Tallahassee college night — strike, Rattlers, strike!',
      songs: ['yeah', 'uptown-funk', 'hey-ya', 'mask-off', 'humble', 'sicko-mode',
        'the-box', 'act-up', 'savage', 'wap', 'up', 'big-energy', 'tomorrow-2',
        'a-milli', 'no-flockin', 'shotta-flow', 'said-sum', 'pop-out',
        'drip-too-hard', 'pushin-p', 'tick-tock', 'whats-poppin',
        'rockstar-dababy', 'family-affair', 'swag-surfin', 'not-like-us',
        'september', 'stomp', 'essence']
    },
    {
      id: 'fsu-seminoles',
      name: 'FSU Seminoles',
      tagline: 'Tallahassee college night — Doak party picks.',
      songs: ['nice-for-what', 'hotline-bling', 'cuff-it', 'kill-bill', 'say-so',
        'need-to-know', 'leave-the-door-open', 'good-days', 'playing-games',
        'no-role-modelz', 'no-problem', 'come-down', 'slow-down', 'gravity',
        'exchange', 'heartbreak-anniversary', 'focus', 'none-of-your-concern',
        'roll-some-mo', 'titi-me-pregunto', 'earfquake', 'super-bass', 'work',
        'crazy-in-love', 'one-dance', 'calm-down', 'umbrella', 'fantasy']
    },
    {
      id: 'tcc-eagles',
      name: 'TCC Eagles',
      tagline: 'Tallahassee college night — dorm-party smooth.',
      songs: ['rock-the-boat', 'no-scrubs', 'never-too-much', 'i-wanna-dance',
        'one-two-step', 'aston-martin-music', 'uptown-funk', 'family-affair',
        'crazy-in-love', 'hey-ya', 'leave-the-door-open', 'say-so', 'cuff-it',
        'good-days', 'slow-down', 'come-down', 'no-problem', 'no-role-modelz',
        'exchange', 'gravity', 'focus', 'heartbreak-anniversary',
        'playing-games', 'roll-some-mo', 'sweet-love', 'real-love', 'september']
    },
    {
      id: '90s-hip-hop',
      name: '90s Hip Hop',
      tagline: '90s Hip Hop Night — nothing but 1990–1999 pillars. Pac, Biggie, Dre, Snoop, Cube, Wu-Tang, Tribe, Missy, Lauryn — the decade that built the game.',
      songs: ['california-love', 'juicy', 'mo-money-mo-problems',
        'if-i-ruled-the-world', 'nuthin-but-a-g-thang', 'gin-and-juice',
        'it-was-a-good-day', 'hard-knock-life', 'ruff-ryders-anthem', 'cream',
        'scenario', 'doo-wop', 'the-rain', 'shoop', 'mama-said-knock-you-out',
        'u-cant-touch-this', 'ice-ice-baby', 'baby-got-back', 'jump-around',
        'insane-in-the-brain', 'tha-crossroads', 'regulate',
        'gangstas-paradise', 'hip-hop-hooray']
    },
    {
      id: 'crunk-night',
      name: 'Crunk Night',
      tagline: 'Crunk Night — Lil Jon, Ying Yang Twins, Crime Mob, Franchize Boyz and the whole Down South takeover. To the window, to the wall.',
      songs: ['get-low', 'wait-whisper-song', 'salt-shaker', 'stand-up',
        'move-bitch', 'stay-fly', 'knuck-if-you-buck', 'lean-wit-it',
        'laffy-taffy', 'tipsy', 'freek-a-leek', 'vice-versa', 'snap-yo-fingers',
        'soul-survivor', 'what-you-know', 'atliens', 'yeah', 'mask-off',
        'bad-and-boujee', 'drip-too-hard', 'said-sum', 'act-up', 'no-flockin',
        'tomorrow-2', 'swag-surfin']
    },
    {
      id: 'verzuz-night',
      name: 'Verzuz Night',
      tagline: 'Verzuz Night — head-to-head anthem energy. Every record on this card is a closer: play it and the whole room has to answer.',
      songs: ['california-love', 'juicy', 'nuthin-but-a-g-thang',
        'hard-knock-life', 'cream', 'ruff-ryders-anthem', 'get-low', 'a-milli',
        'humble', 'sicko-mode', 'yeah', 'uptown-funk', 'crazy-in-love',
        'hey-ya', 'jump-around', 'baby-got-back', 'mo-money-mo-problems',
        'gangstas-paradise', 'ms-jackson', 'mask-off', 'bad-and-boujee',
        'super-bass', 'no-scrubs', 'family-affair', 'not-like-us', 'gods-plan',
        'respect', 'september']
    },
    {
      id: 'queens-of-hip-hop',
      name: 'Queens of Hip Hop',
      tagline: 'Queens of Hip Hop Night — the women MCs run this card, from Salt-N-Pepa and Queen Latifah to Cardi, Megan, Latto and GloRilla.',
      songs: ['shoop', 'unity', 'doo-wop', 'the-rain', 'no-scrubs',
        'super-bass', 'up', 'wap', 'savage', 'big-energy', 'tomorrow-2',
        'act-up', 'say-so', 'need-to-know', 'cuff-it', 'crazy-in-love', 'work',
        'rock-the-boat', 'family-affair', 'one-two-step', 'knuck-if-you-buck',
        'killing-me-softly', 'kill-bill', 'good-days', 'i-like-it']
    },
    {
      id: 'cookout-classics',
      name: 'Cookout Classics',
      tagline: 'Cookout Classics Night — family-reunion records. If your auntie don\'t know it, it ain\'t on this card.',
      songs: ['uptown-funk', 'i-wanna-dance', 'family-affair',
        'this-is-how-we-do-it', 'return-of-the-mack', 'no-diggity', 'hey-ya',
        'yeah', 'never-too-much', 'baby-got-back', 'jump-around',
        'u-cant-touch-this', 'ice-ice-baby', 'shoop', 'hip-hop-hooray',
        'california-love', 'mo-money-mo-problems', 'crazy-in-love',
        'one-two-step', 'hotstepper', 'regulate', 'it-was-a-good-day',
        'ms-jackson', 'buy-u-a-drank', 'september', 'stomp', 'good-times-chic',
        'respect']
    },
    {
      id: 'slow-jamz',
      name: 'Slow Jamz',
      tagline: 'Slow Jamz Night — slow R&B, smooth G-funk grooves and quiet-storm classics. Lights low, phones down.',
      songs: ['exchange', 'gravity', 'playing-games', 'roll-some-mo', 'focus',
        'none-of-your-concern', 'heartbreak-anniversary', 'good-days',
        'leave-the-door-open', 'never-too-much', 'slow-down',
        'the-need-to-know', 'killing-me-softly', 'no-diggity',
        'return-of-the-mack', 'if-i-ruled-the-world', 'it-was-a-good-day',
        'regulate', 'rock-the-boat', 'one-man', 'doo-wop', 'ms-jackson',
        'aston-martin-music', 'come-down', 'sweet-love', 'real-love',
        'hold-on-were-going-home']
    },
    {
      id: 'country-roads',
      name: 'Country Roads',
      tagline: 'Country Night — Dolly, Cash, Shania and Stapleton up front, Beyoncé and Lil Nas X closing the bar down. Boots optional, singalong mandatory.',
      songs: ['jolene', '9-to-5', 'i-walk-the-line', 'ring-of-fire',
        'man-i-feel-like-a-woman', 'youre-still-the-one',
        'friends-in-low-places', 'chattahoochee', 'boot-scootin-boogie',
        'neon-moon', 'fancy', 'strawberry-wine', 'redneck-woman',
        'before-he-cheats', 'need-you-now', 'tennessee-whiskey',
        'fast-car-luke', 'when-it-rains-it-pours', 'last-night-morgan',
        'whiskey-glasses', 'texas-hold-em', 'country-roads',
        'sweet-home-alabama', 'old-town-road']
    },
    {
      id: 'house-party',
      name: 'House Party',
      tagline: 'House Party Night — Chicago house classics, disco roots and festival closers. If it ever shut a dancefloor down, it\'s on this card.',
      songs: ['show-me-love', 'finally-cece', 'gypsy-woman', 'one-more-time',
        'get-lucky', 'i-feel-love', 'good-times-chic', 'september',
        'break-my-soul', 'levels', 'latch', 'uptown-funk', 'i-wanna-dance',
        'hey-ya', 'cuff-it', 'yeah', 'one-two-step', 'super-bass', 'say-so',
        'crazy-in-love', 'family-affair', 'get-low', 'work', 'buy-u-a-drank']
    },
    {
      id: 'afrobeats-heat',
      name: 'Afrobeats Heat',
      tagline: 'Afrobeats Heat — Lagos to Joburg to Kingston on one card. Wizkid, Burna, Davido, Rema and the amapiano closer.',
      songs: ['essence', 'ojuelegba', 'last-last', 'ye-burna', 'on-the-low',
        'peru', 'calm-down', 'rush-ayra', 'love-nwantiti', 'johnny-yemi',
        'mad-over-you', 'oliver-twist', 'kukere', 'personally-psquare',
        'chop-my-money', 'african-queen', 'fall-davido', 'if-davido',
        'unavailable', 'mnike', 'temperature', 'get-busy', 'one-dance', 'work']
    },
    {
      id: 'soul-queens',
      name: 'Soul Queens',
      tagline: 'Soul Queens Night — Aretha, Tina, Whitney, Mariah and the R&B royalty. Every record on this card is a crown.',
      songs: ['respect', 'proud-mary', 'fantasy', 'real-love',
        'the-boy-is-mine', 'single-ladies', 'umbrella', 'sweet-love',
        'i-wanna-dance', 'rock-the-boat', 'no-scrubs', 'family-affair',
        'doo-wop', 'killing-me-softly', 'cuff-it', 'crazy-in-love', 'work',
        'kill-bill', 'good-days', 'playing-games', 'focus', 'unity', 'shoop',
        'one-two-step', 'say-so']
    },
    {
      id: 'pop-party',
      name: 'Pop Party',
      tagline: 'Pop Party Night — the biggest choruses on the planet. If a stadium ever sang it back, it\'s here.',
      songs: ['uptown-funk', 'say-so', 'need-to-know', 'super-bass',
        'i-wanna-dance', 'crazy-in-love', 'single-ladies', 'umbrella',
        'fantasy', 'hotline-bling', 'one-dance', 'gods-plan', 'in-my-feelings',
        'titi-me-pregunto', 'i-like-it', 'gasolina', 'cuff-it', 'kill-bill',
        'up', 'work', 'hey-ya', 'yeah', 'september', 'old-town-road']
    },
    {
      id: 'versus-drake-kendrick',
      name: 'VERSUS: Drake vs Kendrick',
      tagline: 'VERSUS Night — the 6 God vs K-Dot. Twelve a side, no neutrals allowed: every square you mark is a side picked.',
      songs: ['gods-plan', 'one-dance', 'in-my-feelings',
        'started-from-the-bottom', 'hold-on-were-going-home', 'passionfruit',
        'headlines', 'take-care', 'controlla', 'best-i-ever-had',
        'nice-for-what', 'hotline-bling', 'alright', 'dna', 'swimming-pools',
        'money-trees', 'king-kunta', 'love-kendrick', 'poetic-justice',
        'not-like-us', 'maad-city', 'bitch-dont-kill-my-vibe', 'fkin-problems',
        'humble']
    },
    {
      id: 'versus-old-school-new-school',
      name: 'VERSUS: Old School vs New School',
      tagline: 'VERSUS Night — the pillars vs the new wave. Twelve classics, twelve modern closers: the card itself is the argument.',
      songs: ['california-love', 'juicy', 'nuthin-but-a-g-thang',
        'gin-and-juice', 'it-was-a-good-day', 'cream', 'scenario',
        'mama-said-knock-you-out', 'walk-this-way', 'u-cant-touch-this',
        'respect', 'proud-mary', 'humble', 'not-like-us', 'gods-plan',
        'sicko-mode', 'the-box', 'wap', 'savage', 'cuff-it', 'kill-bill',
        'essence', 'calm-down', 'last-last']
    },
    {
      id: 'versus-east-west',
      name: 'VERSUS: East Coast vs West Coast',
      tagline: 'VERSUS Night — the coasts settle it on the card. Twelve New York pillars, twelve West Coast classics.',
      songs: ['juicy', 'mo-money-mo-problems', 'cream', 'scenario',
        'hard-knock-life', 'mama-said-knock-you-out', 'walk-this-way',
        'fight-for-your-right', 'shoop', 'unity', 'doo-wop', 'hip-hop-hooray',
        'california-love', 'nuthin-but-a-g-thang', 'gin-and-juice',
        'it-was-a-good-day', 'gangstas-paradise', 'regulate',
        'insane-in-the-brain', 'humble', 'not-like-us', 'swimming-pools',
        'money-trees', 'dna']
    },
    {
      id: 'versus-90s-2000s',
      name: 'VERSUS: 90s vs 2000s',
      tagline: 'VERSUS Night — the golden decade vs the crunk decade. Twelve 90s pillars, twelve 2000s takeovers.',
      songs: ['california-love', 'juicy', 'mo-money-mo-problems',
        'nuthin-but-a-g-thang', 'gin-and-juice', 'it-was-a-good-day', 'cream',
        'scenario', 'hard-knock-life', 'ruff-ryders-anthem',
        'gangstas-paradise', 'no-diggity', 'get-low', 'stand-up', 'move-bitch',
        'lean-wit-it', 'laffy-taffy', 'tipsy', 'salt-shaker',
        'wait-whisper-song', 'yeah', 'crazy-in-love', 'hey-ya', 'one-two-step']
    },
    {
      id: 'versus-queens-kings',
      name: 'VERSUS: Queens vs Kings',
      tagline: 'VERSUS Night — the queens run twelve, the kings answer with twelve. Crowns only.',
      songs: ['shoop', 'unity', 'doo-wop', 'the-rain', 'super-bass', 'up',
        'savage', 'big-energy', 'respect', 'single-ladies', 'fantasy',
        'the-boy-is-mine', 'juicy', 'cream', 'humble', 'a-milli', 'gods-plan',
        'not-like-us', 'california-love', 'gin-and-juice', 'yeah',
        'never-too-much', 'september', 'it-was-a-good-day']
    },
    {
      id: 'versus-north-south',
      name: 'VERSUS: North vs South',
      tagline: 'VERSUS Night — up top vs down bottom. Twelve Northern pillars, twelve Southern takeover records.',
      songs: ['juicy', 'mo-money-mo-problems', 'cream', 'scenario',
        'hard-knock-life', 'mama-said-knock-you-out', 'walk-this-way',
        'fight-for-your-right', 'shoop', 'unity', 'hip-hop-hooray', 'one-man',
        'get-low', 'knuck-if-you-buck', 'stand-up', 'what-you-know',
        'soul-survivor', 'atliens', 'ms-jackson', 'laffy-taffy', 'tipsy',
        'freek-a-leek', 'swag-surfin', 'no-role-modelz']
    },
    {
      id: 'versus-pusha-wayne',
      name: 'VERSUS: Pusha T vs Lil Wayne',
      tagline: 'VERSUS Night — Virginia ice-cream man vs Weezy F. Twelve a side: Clipse classics and solo Push against the Carter run. Pick a side, mark it loud.',
      songs: ['grindin', 'when-the-last-time', 'mr-me-too', 'wamp-wamp', 'kinda-like-a-big-deal', 'popular-demand', 'numbers-on-the-boards', 'nosetalgia', 'if-you-know-you-know', 'diet-coke', 'drug-dealers-anonymous', 'trouble-on-my-mind', 'a-milli', 'lollipop', 'go-dj', 'fireman', '6-foot-7-foot', 'how-to-love', 'love-me-wayne', 'uproar', 'mrs-officer', 'got-money', 'right-above-it', 'mirror']
    },
    {
      id: 'versus-ti-jeezy',
      name: 'VERSUS: T.I. vs Jeezy',
      tagline: 'VERSUS Night — the King of the South vs the Snowman. Twelve rubber bands against twelve trap stars: Atlanta settles it on this card.',
      songs: ['what-you-know', 'bring-em-out', 'rubber-band-man', 'u-dont-know-me', 'top-back', 'big-shit-poppin', 'whatever-you-like', 'live-your-life', 'dead-and-gone', 'asap-ti', 'no-mediocre', 'about-the-money', 'soul-survivor', 'put-on', 'go-crazy', 'i-luv-it', 'go-getta', 'my-president', 'trap-star', 'and-then-what', 'lose-my-mind', 'seen-it-all', 'air-forces', 'standing-ovation']
    },
    {
      id: 'versus-jeezy-gucci',
      name: 'VERSUS: Jeezy vs Gucci Mane',
      tagline: 'VERSUS Night — trap royalty head to head. Twelve Snowman staples against twelve Guwop essentials, First Day Out included.',
      songs: ['soul-survivor', 'put-on', 'go-crazy', 'i-luv-it', 'go-getta', 'my-president', 'trap-star', 'and-then-what', 'lose-my-mind', 'seen-it-all', 'air-forces', 'standing-ovation', 'lemonade-gucci', 'wasted-gucci', 'freaky-gurl', 'i-think-i-love-her', 'spotlight-gucci', 'wake-up-in-the-sky', 'i-get-the-bag', 'both-gucci', 'curve-gucci', 'first-day-out', 'tone-it-down', 'rumors-gucci']
    },
    {
      id: 'versus-beyonce-rihanna',
      name: 'VERSUS: Beyoncé vs Rihanna',
      tagline: 'VERSUS Night — Queen Bey vs RiRi. Twelve hive anthems against twelve navy staples: every square is a side picked.',
      songs: ['cuff-it', 'crazy-in-love', 'single-ladies', 'break-my-soul', 'texas-hold-em', 'irreplaceable', 'halo', 'love-on-top', 'formation', 'drunk-in-love', 'partition', 'baby-boy', 'work', 'umbrella', 'pon-de-replay', 'sos-rihanna', 'disturbia', 'rude-boy', 'only-girl', 'we-found-love', 'diamonds', 'stay-rihanna', 'needed-me', 'love-on-the-brain']
    },
    {
      id: 'versus-nicki-cardi',
      name: 'VERSUS: Nicki Minaj vs Cardi B',
      tagline: 'VERSUS Night — the Queen of Rap vs the Bronx takeover. Twelve Barbz classics against twelve Cardi closers.',
      songs: ['super-bass', 'anaconda', 'starships', 'pound-the-alarm', 'moment-4-life', 'your-love-nicki', 'fly-nicki', 'beez-in-the-trap', 'chun-li', 'super-freaky-girl', 'barbie-dreams', 'good-form', 'up', 'wap', 'i-like-it', 'bodak-yellow', 'money-cardi', 'press-cardi', 'be-careful', 'ring-cardi', 'bartier-cardi', 'finesse-remix', 'no-limit', 'tomorrow-2']
    },
    {
      id: 'versus-brandy-monica',
      name: 'VERSUS: Brandy vs Monica',
      tagline: 'VERSUS Night — the Vocal Bible vs Miss Thang. Twelve a side, and yes, The Boy Is Mine is on this card exactly once.',
      songs: ['the-boy-is-mine', 'i-wanna-be-down', 'baby-brandy', 'best-friend-brandy', 'sittin-up-in-my-room', 'have-you-ever', 'almost-doesnt-count', 'full-moon', 'what-about-us', 'afrodisiac', 'brokenhearted', 'put-it-down', 'dont-take-it-personal', 'before-you-walk-out', 'why-i-love-you-so-much', 'for-you-i-will', 'the-first-night', 'angel-of-mine', 'so-gone', 'u-shouldve-known-better', 'everything-to-me', 'love-all-over-me', 'still-standing', 'until-its-gone']
    },
    {
      id: 'versus-mariah-whitney',
      name: 'VERSUS: Mariah Carey vs Whitney Houston',
      tagline: 'VERSUS Night — the two greatest voices ever pressed to wax. Twelve lamb anthems against twelve Whitney crowns. Sing-offs will happen.',
      songs: ['fantasy', 'vision-of-love', 'emotions', 'dreamlover', 'hero', 'always-be-my-baby', 'honey-mariah', 'heartbreaker', 'we-belong-together', 'shake-it-off', 'touch-my-body', 'obsessed', 'i-wanna-dance', 'how-will-i-know', 'greatest-love-of-all', 'im-your-baby-tonight', 'i-will-always-love-you', 'exhale', 'my-love-is-your-love', 'its-not-right-but-its-okay', 'heartbreak-hotel', 'when-you-believe', 'million-dollar-bill', 'all-the-man-that-i-need']
    },
    {
      id: 'versus-maryj-faith',
      name: 'VERSUS: Mary J. Blige vs Faith Evans',
      tagline: 'VERSUS Night — the Queen of Hip-Hop Soul vs the First Lady of Bad Boy. Twelve a side of pure 90s R&B royalty.',
      songs: ['family-affair', 'real-love', 'you-remind-me', 'im-goin-down', 'not-gon-cry', 'be-without-you', 'just-fine', 'mr-wrong', 'enough-cryin', 'i-can-love-you', 'take-me-as-i-am', 'love-at-1st-sight', 'you-used-to-love-me', 'soon-as-i-get-home', 'aint-nobody-faith', 'love-like-this', 'i-love-you-faith', 'never-gonna-let-you-go', 'burnin-up-faith', 'you-gets-no-love', 'cant-believe-faith', 'mesmerized', 'again-faith', 'ill-be-missing-you']
    },
    {
      id: 'versus-mj-prince',
      name: 'VERSUS: Michael Jackson vs Prince',
      tagline: 'VERSUS Night — the King of Pop vs the Purple One. Twelve MJ crowns against twelve Prince essentials: the two most performable catalogs ever pressed, settled on one card.',
      songs: ['billie-jean', 'beat-it', 'thriller', 'smooth-criminal', 'black-or-white', 'the-way-you-make-me-feel', 'man-in-the-mirror', 'dont-stop-til-you-get-enough', 'rock-with-you', 'wanna-be-startin-somethin', 'pyt', 'remember-the-time', 'purple-rain', 'when-doves-cry', 'kiss-prince', 'little-red-corvette', '1999-prince', 'raspberry-beret', 'i-wanna-be-your-lover', 'i-would-die-4-u', 'cream-prince', 'u-got-the-look', 'most-beautiful-girl', 'gett-off']
    },
    {
      id: 'versus-kendrick-cole',
      name: 'VERSUS: Kendrick Lamar vs J. Cole',
      tagline: 'VERSUS Night — Kung Fu Kenny vs Cole World. Twelve a side: the two lyric kings of their generation go bar for bar, and every square is a side picked.',
      songs: ['humble', 'not-like-us', 'alright', 'dna', 'swimming-pools', 'money-trees', 'king-kunta', 'love-kendrick', 'poetic-justice', 'maad-city', 'bitch-dont-kill-my-vibe', 'all-the-stars', 'no-role-modelz', 'work-out', 'power-trip', 'crooked-smile', 'apparently', 'wet-dreamz', 'middle-child', 'love-yourz', 'gomd', 'deja-vu', 'neighbors', 'a-tale-of-2-citiez']
    }
  ];

  var DECK_MAP = {};
  DECKS.forEach(function (d) { DECK_MAP[d.id] = d; });

  /** Full display label for a song, e.g. "Beyoncé — Cuff It". */
  function label(songId) {
    var s = SONG_MAP[songId];
    return s ? (s.artist + ' — ' + s.title) : songId;
  }

  /** YouTube watch/embed/search helpers. */
  function embedUrl(songId) {
    var s = SONG_MAP[songId];
    return s && s.yt ? 'https://www.youtube.com/embed/' + s.yt + '?autoplay=1&rel=0' : '';
  }
  function searchUrl(songId) {
    var s = SONG_MAP[songId];
    var q = s ? (s.artist + ' ' + s.title + ' official video') : songId;
    return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q);
  }

  return {
    SONGS: SONGS,
    SONG_MAP: SONG_MAP,
    DECKS: DECKS,
    DECK_MAP: DECK_MAP,
    label: label,
    embedUrl: embedUrl,
    searchUrl: searchUrl
  };
});

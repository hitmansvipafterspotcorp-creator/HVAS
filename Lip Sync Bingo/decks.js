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
 * `yt` holds a VERIFIED YouTube video ID (checked against multiple independent
 * embeds). 73 of the 110 carry verified IDs: the 24 starter songs plus 49 of
 * the 50 era records. Songs whose ID was not verified ship with yt:'' and the
 * app falls back to a "Find on YouTube" search link. IDs are never guessed.
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
  /* Song pool. `src:'starter'` = on the After Spot Starter card (yt     */
  /* verified). `src:'pool'` = from Korey's original 39-song SONG_POOL.  */
  /* `src:'90s'` / `src:'crunk'` = era records added Nov 19, 2026 (yt    */
  /* verified the same way; T.I. - What You Know is the one exception —  */
  /* no official upload could be confirmed, so it ships on fallback).    */
  /* ------------------------------------------------------------------ */
  var SONGS = [
    /* ---- After Spot Starter 24 (YouTube IDs verified) ---- */
    { id: 'uptown-funk',        artist: 'Bruno Mars',      title: 'Uptown Funk',                  yt: 'OPf0YbXqDm0', src: 'starter' },
    { id: 'a-milli',            artist: 'Lil Wayne',       title: 'A Milli',                      yt: '1Vf4mMCpNY0', src: 'starter' },
    { id: 'up',                 artist: 'Cardi B',         title: 'Up',                           yt: 'rCiBgLOcuKU', src: 'starter' },
    { id: 'cuff-it',            artist: 'Beyoncé',         title: 'Cuff It',                      yt: 'yrtWLyp5gLI', src: 'both' },
    { id: 'super-bass',         artist: 'Nicki Minaj',     title: 'Super Bass',                   yt: '4JipHEz53sU', src: 'starter' },
    { id: 'work',               artist: 'Rihanna',         title: 'Work',                         yt: 'HL1UzIK-flA', src: 'starter' },
    { id: 'rock-the-boat',      artist: 'Aaliyah',         title: 'Rock The Boat',                yt: '3HSJU5fDg0A', src: 'starter' },
    { id: 'i-wanna-dance',      artist: 'Whitney Houston', title: 'I Wanna Dance With Somebody',  yt: 'eH3giaIzONA', src: 'starter' },
    { id: 'big-energy',         artist: 'Latto',           title: 'Big Energy',                   yt: 'T8GpG8C0YzA', src: 'starter' },
    { id: 'mask-off',           artist: 'Future',          title: 'Mask Off',                     yt: 'xvZqHgFz51I', src: 'both' },
    { id: 'no-scrubs',          artist: 'TLC',             title: 'No Scrubs',                    yt: 'FrLequ6dUdM', src: 'starter' },
    { id: 'buy-u-a-drank',      artist: 'T-Pain',          title: 'Buy U A Drank',                yt: 'dBrRBZy8OTs', src: 'starter' },
    { id: 'family-affair',      artist: 'Mary J. Blige',   title: 'Family Affair',                yt: 'znlFu_lemsU', src: 'starter' },
    { id: 'tomorrow-2',         artist: 'GloRilla',        title: 'Tomorrow 2',                   yt: 'zwa7NzNBQig', src: 'starter' },
    { id: 'yeah',               artist: 'Usher',           title: 'Yeah!',                        yt: 'GxBSyx85Kp8', src: 'starter' },
    { id: 'bad-and-boujee',     artist: 'Migos',           title: 'Bad and Boujee',               yt: 'S-sJp1FfG7Q', src: 'starter' },
    { id: 'no-flockin',         artist: 'Kodak Black',     title: 'No Flockin',                   yt: 'UE_-obgiWm0', src: 'starter' },
    { id: 'nice-for-what',      artist: 'Drake',           title: 'Nice For What',                yt: 'U9BwWKXjVaI', src: 'starter' },
    { id: 'never-too-much',     artist: 'Luther Vandross', title: 'Never Too Much',               yt: 'pNj9bXKGOiI', src: 'starter' },
    { id: 'aston-martin-music', artist: 'Rick Ross',       title: 'Aston Martin Music',           yt: 'a35rNEBNiO4', src: 'starter' },
    { id: 'crazy-in-love',      artist: 'Beyoncé',         title: 'Crazy In Love',                yt: 'ViwtNLUqkMY', src: 'starter' },
    { id: 'kill-bill',          artist: 'SZA',             title: 'Kill Bill',                    yt: 'MSRcC626prw', src: 'both' },
    { id: 'hey-ya',             artist: 'Outkast',         title: 'Hey Ya!',                      yt: 'PWgvGjAhvIw', src: 'starter' },
    { id: 'one-two-step',       artist: 'Ciara',           title: '1, 2 Step',                    yt: 'iBHNgV6_znU', src: 'starter' },

    /* ---- The rest of Korey's original 39-song SONG_POOL (yt unverified -> fallback link) ---- */
    { id: 'hotline-bling',      artist: 'Drake',             title: 'Hotline Bling',              yt: 'uxpDa-c-4Mc', src: 'pool' },
    { id: 'humble',             artist: 'Kendrick Lamar',    title: 'HUMBLE.',                    yt: 'tvTRZJ-4EyI', src: 'pool' },
    { id: 'titi-me-pregunto',   artist: 'Bad Bunny',         title: 'Tití Me Preguntó',           yt: 'Cr8K88UcO0s', src: 'pool' },
    { id: 'say-so',             artist: 'Doja Cat',          title: 'Say So',                     yt: 'pok8H_KF1FA', src: 'pool' },
    { id: 'earfquake',          artist: 'Tyler, The Creator', title: 'EARFQUAKE',                 yt: 'HmAsUQEFYGI', src: 'pool' },
    { id: 'wap',                artist: 'Cardi B',           title: 'WAP',                        yt: 'hsm4poTWjMs', src: 'pool' },
    { id: 'drip-too-hard',      artist: 'Lil Baby & Gunna',  title: 'Drip Too Hard',              yt: '_YzD9KW82sk', src: 'pool' },
    { id: 'pushin-p',           artist: 'Gunna',             title: 'pushin P',                   yt: '9g08kucPQtE', src: 'pool' },
    { id: 'tick-tock',          artist: 'Young Thug',        title: 'Tick Tock',                  yt: 'sxfr4RooJkI', src: 'pool' },
    { id: 'xo-tour-llif3',      artist: 'Lil Uzi Vert',      title: 'XO TOUR Llif3',              yt: 'WrsFXgQk5UI', src: 'pool' },
    { id: 'sicko-mode',         artist: 'Travis Scott',      title: 'SICKO MODE',                 yt: '6ONRf7h3Mdk', src: 'pool' },
    { id: 'rockstar-post',      artist: 'Post Malone',       title: 'rockstar',                   yt: 'UceaB4D0jpo', src: 'pool' },
    { id: 'savage',             artist: 'Megan Thee Stallion', title: 'Savage',                   yt: 'EOxj2ROIxok', src: 'pool' },
    { id: 'act-up',             artist: 'City Girls',        title: 'Act Up',                     yt: 'F_VsAvS1kuo', src: 'pool' },
    { id: 'rockstar-dababy',    artist: 'DaBaby',            title: 'ROCKSTAR',                   yt: '83xBPCw5hh4', src: 'pool' },
    { id: 'the-box',            artist: 'Roddy Ricch',       title: 'The Box',                    yt: 'UNZqm3dxd2w', src: 'pool' },
    { id: 'whats-poppin',       artist: 'Jack Harlow',       title: 'WHATS POPPIN',               yt: 'HIwAI05Y1fU', src: 'pool' },
    { id: 'pop-out',            artist: 'Polo G',            title: 'Pop Out',                    yt: 'g-uW3I_AtDE', src: 'pool' },
    { id: 'shotta-flow',        artist: 'NLE Choppa',        title: 'Shotta Flow',                yt: '3W0e7aI0gAg', src: 'pool' },
    { id: 'said-sum',           artist: 'Moneybagg Yo',      title: 'Said Sum',                   yt: 'T8pi91qWnRw', src: 'pool' },
    { id: 'one-man',            artist: 'Big Sean',          title: 'One Man Can Change the World', yt: 'GBVotNefYME', src: 'pool' },
    { id: 'no-problem',         artist: 'Chance the Rapper', title: 'No Problem',                 yt: 'DVkkYlQNmbc', src: 'pool' },
    { id: 'the-need-to-know',   artist: 'Wale',              title: 'The Need To Know',           yt: 'YyEbAoFrYtg', src: 'pool' },
    { id: 'no-role-modelz',     artist: 'J. Cole',           title: 'No Role Modelz',             yt: '8HBcV0MtAQg', src: 'pool' },
    { id: 'exchange',           artist: 'Bryson Tiller',     title: 'Exchange',                   yt: 'aj9coPGuFkM', src: 'pool' },
    { id: 'gravity',            artist: 'Brent Faiyaz',      title: 'Gravity',                    yt: 'FBM4cdml6Qs', src: 'pool' },
    { id: 'playing-games',      artist: 'Summer Walker',     title: 'Playing Games',              yt: 'SDSXLkD74KE', src: 'pool' },
    { id: 'roll-some-mo',       artist: 'Lucky Daye',        title: "Roll Some Mo'",              yt: '6WXmaJcguXo', src: 'pool' },
    { id: 'focus',              artist: 'H.E.R.',            title: 'Focus',                      yt: 'Uj9y5xkHZaU', src: 'pool' },
    { id: 'none-of-your-concern', artist: 'Jhené Aiko',      title: 'None of Your Concern',       yt: 'PmeRjrz8KVw', src: 'pool' },
    { id: 'come-down',          artist: 'Anderson .Paak',    title: 'Come Down',                  yt: '-OqrcUvrbRY', src: 'pool' },
    { id: 'slow-down',          artist: 'Smino',             title: 'Slow Down',                  yt: '2wq-cca7Uu4', src: 'pool' },
    { id: 'good-days',          artist: 'SZA',               title: 'Good Days',                  yt: '2p3zZoraK9g', src: 'pool' },
    { id: 'heartbreak-anniversary', artist: 'Giveon',        title: 'Heartbreak Anniversary',     yt: 'uWRlisQu4fo', src: 'pool' },
    { id: 'need-to-know',       artist: 'Doja Cat',          title: 'Need to Know',               yt: 'dI3xkL7qUAc', src: 'pool' },
    { id: 'leave-the-door-open', artist: 'Silk Sonic',       title: 'Leave the Door Open',        yt: 'adLGHcj_fmA', src: 'pool' },

    /* ---- '90s hip hop pillars (added Nov 19, 2026 — YouTube IDs verified) ---- */
    { id: 'california-love',    artist: '2Pac',              title: 'California Love',            yt: 'N0VdRLdg2ng', src: '90s' },
    { id: 'juicy',              artist: 'The Notorious B.I.G.', title: 'Juicy',                   yt: '_JZom_gVfuw', src: '90s' },
    { id: 'mo-money-mo-problems', artist: 'The Notorious B.I.G.', title: 'Mo Money Mo Problems', yt: 'gUhRKVIjJtw', src: '90s' },
    { id: 'if-i-ruled-the-world', artist: 'Nas',             title: 'If I Ruled the World',       yt: 'mlp-IIG9ApU', src: '90s' },
    { id: 'nuthin-but-a-g-thang', artist: 'Dr. Dre ft. Snoop Dogg', title: "Nuthin' but a 'G' Thang", yt: '8GliyDgAGQI', src: '90s' },
    { id: 'gin-and-juice',      artist: 'Snoop Dogg',        title: 'Gin and Juice',              yt: 'fWCZse1iwE0', src: '90s' },
    { id: 'it-was-a-good-day',  artist: 'Ice Cube',          title: 'It Was a Good Day',          yt: 'h4UqMyldS7Q', src: '90s' },
    { id: 'hard-knock-life',    artist: 'Jay-Z',             title: 'Hard Knock Life',            yt: 'rN5OVPcyJ4Q', src: '90s' },
    { id: 'ruff-ryders-anthem', artist: 'DMX',               title: "Ruff Ryders' Anthem",        yt: 'ThlhSnRk21E', src: '90s' },
    { id: 'cream',              artist: 'Wu-Tang Clan',      title: 'C.R.E.A.M.',                 yt: 'PBwAxmrE194', src: '90s' },
    { id: 'scenario',           artist: 'A Tribe Called Quest', title: 'Scenario',                yt: 'Q6TLWqn82J4', src: '90s' },
    { id: 'ms-jackson',         artist: 'Outkast',           title: 'Ms. Jackson',                yt: 'MYxAiK6VnXw', src: '90s' },
    { id: 'doo-wop',            artist: 'Lauryn Hill',       title: 'Doo Wop (That Thing)',       yt: 'T6QKqFPRZSA', src: '90s' },
    { id: 'the-rain',           artist: 'Missy Elliott',     title: 'The Rain (Supa Dupa Fly)',   yt: 'hHcyJPTTn9w', src: '90s' },
    { id: 'shoop',              artist: 'Salt-N-Pepa',       title: 'Shoop',                      yt: '4vaN01VLYSQ', src: '90s' },
    { id: 'mama-said-knock-you-out', artist: 'LL Cool J',    title: 'Mama Said Knock You Out',    yt: 'vimZj8HW0Kg', src: '90s' },
    { id: 'walk-this-way',      artist: 'Run-DMC ft. Aerosmith', title: 'Walk This Way',          yt: '4B_UYYPb-Gk', src: '90s' },
    { id: 'fight-for-your-right', artist: 'Beastie Boys',    title: 'Fight for Your Right',       yt: 'eBShN8qT4lk', src: '90s' },
    { id: 'u-cant-touch-this',  artist: 'MC Hammer',         title: "U Can't Touch This",         yt: 'otCpCn0l4Wo', src: '90s' },
    { id: 'ice-ice-baby',       artist: 'Vanilla Ice',       title: 'Ice Ice Baby',               yt: 'rog8ou-ZepE', src: '90s' },
    { id: 'baby-got-back',      artist: 'Sir Mix-a-Lot',     title: 'Baby Got Back',              yt: 'X53ZSxkQ3Ho', src: '90s' },
    { id: 'jump-around',        artist: 'House of Pain',     title: 'Jump Around',                yt: 'jrL_LzX5wv4', src: '90s' },
    { id: 'insane-in-the-brain', artist: 'Cypress Hill',     title: 'Insane in the Brain',        yt: 'RijB8wnJCN0', src: '90s' },
    { id: 'tha-crossroads',     artist: 'Bone Thugs-n-Harmony', title: 'Tha Crossroads',          yt: 'VMYAEHE2GrM', src: '90s' },
    { id: 'regulate',           artist: 'Warren G ft. Nate Dogg', title: 'Regulate',              yt: '1plPyJdXKIY', src: '90s' },
    { id: 'gangstas-paradise',  artist: 'Coolio',            title: "Gangsta's Paradise",         yt: 'fPO76Jlnz6c', src: '90s' },
    { id: 'around-the-way-girl', artist: 'LL Cool J',        title: 'Around the Way Girl',        yt: 'Sm36viw6q1U', src: '90s' },
    { id: 'unity',              artist: 'Queen Latifah',     title: 'U.N.I.T.Y.',                 yt: 'f8cHxydDb7o', src: '90s' },
    { id: 'hip-hop-hooray',     artist: 'Naughty by Nature', title: 'Hip Hop Hooray',             yt: 'Rz1Xn1vzOM4', src: '90s' },
    { id: 'no-diggity',         artist: 'Blackstreet ft. Dr. Dre', title: 'No Diggity',           yt: '3KL9mRus19o', src: '90s' },
    { id: 'killing-me-softly',  artist: 'Fugees',            title: 'Killing Me Softly',          yt: 'oKOtzIo-uYw', src: '90s' },
    { id: 'this-is-how-we-do-it', artist: 'Montell Jordan',  title: 'This Is How We Do It',       yt: '0hiUuL5uTKc', src: '90s' },
    { id: 'return-of-the-mack', artist: 'Mark Morrison',     title: 'Return of the Mack',         yt: 'uB1D9wWxd2w', src: '90s' },
    { id: 'hotstepper',         artist: 'Ini Kamoze',        title: 'Here Comes the Hotstepper',  yt: '15UffN8eilI', src: '90s' },

    /* ---- Crunk / Down South (added Nov 19, 2026 — YouTube IDs verified) ---- */
    { id: 'get-low',            artist: 'Lil Jon & The East Side Boyz', title: 'Get Low',         yt: 'IYH7_GzP4Tg', src: 'crunk' },
    { id: 'wait-whisper-song',  artist: 'Ying Yang Twins',   title: 'Wait (The Whisper Song)',    yt: 'HAnXIIv5He8', src: 'crunk' },
    { id: 'salt-shaker',        artist: 'Ying Yang Twins',   title: 'Salt Shaker',                yt: 'aJEzl31zL-I', src: 'crunk' },
    { id: 'stand-up',           artist: 'Ludacris',          title: 'Stand Up',                   yt: 'pZG7IK99OvI', src: 'crunk' },
    { id: 'move-bitch',         artist: 'Ludacris',          title: 'Move B***h',                 yt: 'tw429JGL5zo', src: 'crunk' },
    { id: 'stay-fly',           artist: 'Three 6 Mafia',     title: 'Stay Fly',                   yt: 'vBjzAdpZzf0', src: 'crunk' },
    { id: 'knuck-if-you-buck',  artist: 'Crime Mob',         title: 'Knuck If You Buck',          yt: '9saEpqhBP5M', src: 'crunk' },
    { id: 'lean-wit-it',        artist: 'Dem Franchize Boyz', title: 'Lean wit It, Rock wit It',  yt: '1OgHtf7DQNA', src: 'crunk' },
    { id: 'laffy-taffy',        artist: 'D4L',               title: 'Laffy Taffy',                yt: '4eVxoIL_Nq0', src: 'crunk' },
    { id: 'tipsy',              artist: 'J-Kwon',            title: 'Tipsy',                      yt: 'VwXeN2FsE7w', src: 'crunk' },
    { id: 'freek-a-leek',       artist: 'Petey Pablo',       title: 'Freek-a-Leek',               yt: 'M48nlk-1kH8', src: 'crunk' },
    { id: 'vice-versa',         artist: 'Pastor Troy',       title: 'Vice Versa',                 yt: '4hmn4cNXBdY', src: 'crunk' },
    { id: 'snap-yo-fingers',    artist: 'Lil Jon',           title: 'Snap Yo Fingers',            yt: 'AoA-ByjIf2M', src: 'crunk' },
    { id: 'soul-survivor',      artist: 'Young Jeezy',       title: 'Soul Survivor',              yt: 'gczBgNB-p1w', src: 'crunk' },
    { id: 'what-you-know',      artist: 'T.I.',              title: 'What You Know',              yt: '_Ym7Mg4yTZc', src: 'crunk' },
    { id: 'atliens',            artist: 'Outkast',           title: 'ATLiens',                    yt: 'ktc9hsSfUck', src: 'crunk' }
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
        'sicko-mode', 'wap', 'the-box', 'savage']
    },
    {
      id: 'hip-hop-heat',
      name: 'Hip-Hop Heat',
      tagline: 'Rap heavy hitters only.',
      songs: ['a-milli', 'up', 'wap', 'humble', 'mask-off', 'bad-and-boujee',
        'no-flockin', 'sicko-mode', 'the-box', 'rockstar-dababy', 'rockstar-post',
        'whats-poppin', 'pop-out', 'shotta-flow', 'said-sum', 'drip-too-hard',
        'pushin-p', 'tick-tock', 'xo-tour-llif3', 'hotline-bling', 'nice-for-what',
        'tomorrow-2', 'big-energy', 'savage']
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
        'slow-down']
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
        'work']
    },
    {
      id: 'famu-rattlers',
      name: 'FAMU Rattlers',
      tagline: 'Tallahassee college night — strike, Rattlers, strike!',
      songs: ['yeah', 'uptown-funk', 'hey-ya', 'mask-off', 'humble', 'sicko-mode',
        'the-box', 'act-up', 'savage', 'wap', 'up', 'big-energy', 'tomorrow-2',
        'a-milli', 'no-flockin', 'shotta-flow', 'said-sum', 'pop-out',
        'drip-too-hard', 'pushin-p', 'tick-tock', 'whats-poppin',
        'rockstar-dababy', 'family-affair']
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
        'crazy-in-love']
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
        'playing-games', 'roll-some-mo']
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
        'tomorrow-2']
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
        'super-bass', 'no-scrubs', 'family-affair']
    },
    {
      id: 'queens-of-hip-hop',
      name: 'Queens of Hip Hop',
      tagline: 'Queens of Hip Hop Night — the women MCs run this card, from Salt-N-Pepa and Queen Latifah to Cardi, Megan, Latto and GloRilla.',
      songs: ['shoop', 'unity', 'doo-wop', 'the-rain', 'no-scrubs',
        'super-bass', 'up', 'wap', 'savage', 'big-energy', 'tomorrow-2',
        'act-up', 'say-so', 'need-to-know', 'cuff-it', 'crazy-in-love', 'work',
        'rock-the-boat', 'family-affair', 'one-two-step', 'knuck-if-you-buck',
        'killing-me-softly', 'kill-bill', 'good-days']
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
        'ms-jackson', 'buy-u-a-drank']
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
        'aston-martin-music', 'come-down']
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

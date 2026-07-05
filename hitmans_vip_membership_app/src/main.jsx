import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const ui = {
  logo: '/assets/ui/source_sheets/ui_05_HITKOIN LOGO.png',
  mainMenuBackground: '/assets/ui/main-menu-background.png',
  loading: '/assets/ui/complete_ui_set/sliced_clean/by_type/screens/source_17_001_1672x941.png',
  banners: {
    granted: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_04_079_350x108.png',
    denied: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_04_107_350x110.png',
  },
  chips: {
    active: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_04_081_121x46.png',
    checkedIn: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_04_083_134x46.png',
    expired: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_04_082_126x46.png',
    staff: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_04_085_119x46.png',
    vip: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_04_084_108x46.png',
  },
  buttons: {
    scan: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_04_108_201x58.png',
    verify: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_04_109_210x58.png',
    grant: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_04_110_205x58.png',
    deny: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_04_114_201x58.png',
    rescan: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_04_115_210x58.png',
    manual: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_04_116_205x58.png',
    selectPlan: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_01_091_286x54.png',
    upgradeVip: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_01_130_286x53.png',
    renewPlan: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_01_154_286x52.png',
  },
  planActions: [
    { label: 'Select Plan', src: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_01_091_286x54.png' },
    { label: 'Upgrade To VIP', src: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_01_130_286x53.png' },
    { label: 'Renew Plan', src: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_01_154_286x52.png' },
  ],
  paymentMethods: [
    { label: 'Credit / Debit', src: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_14_019_190x46.png' },
    { label: 'Apple Pay', src: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_14_022_190x48.png' },
    { label: 'Google Pay', src: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_14_033_190x47.png' },
    { label: 'PayPal', src: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_14_040_189x47.png' },
    { label: 'Cash App', src: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_14_046_189x46.png' },
  ],
  tiers: [
    { name: 'Daily', src: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_01_025_183x338.png' },
    { name: 'Weekly', src: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_01_026_183x338.png' },
    { name: 'Monthly', src: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_01_027_181x337.png' },
    { name: 'Yearly', src: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_01_028_181x337.png' },
    { name: 'VIP', src: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_01_029_179x337.png' },
  ],
  titles: {
    membership: '/assets/ui/complete_ui_set/sliced_clean/by_type/components/source_01_001_897x135.png',
    entry: '/assets/ui/complete_ui_set/sliced_clean/by_type/components/source_04_001_905x140.png',
    verification: '/assets/ui/complete_ui_set/sliced_clean/by_type/screens/source_11_001_661x220.png',
  },
  passes: [
    { name: 'Daily', src: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_04_013_158x227.png' },
    { name: 'Weekly', src: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_04_014_159x228.png' },
    { name: 'Monthly', src: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_04_015_161x228.png' },
    { name: 'Yearly', src: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_04_016_159x228.png' },
    { name: 'VIP', src: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_04_017_158x228.png' },
  ],
  ribbons: [
    '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_01_038_227x43.png',
    '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_01_039_227x42.png',
    '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_01_040_227x43.png',
    '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_01_041_226x42.png',
    '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_01_042_227x42.png',
    '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_01_043_227x43.png',
  ],
  bingo: {
    welcome: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_08_005_512x217.png',
    invite: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_08_079_254x318.png',
    minPlayers: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_08_025_465x86.png',
    join: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_08_092_293x79.png',
    ready: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_08_140_173x71.png',
    party: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_08_142_213x71.png',
  },
  assembled: {
    membership: '/assets/ui/complete_ui_set/sliced_clean/by_type/screens/source_01_186_661x306.png',
    entryMember: '/assets/ui/complete_ui_set/sliced_clean/by_type/screens/source_04_002_472x247.png',
    entryStaff: '/assets/ui/complete_ui_set/sliced_clean/by_type/screens/source_04_080_310x362.png',
    bingoStyle: '/assets/ui/complete_ui_set/sliced_clean/by_type/screens/source_06_228_421x224.png',
    tv: '/assets/ui/complete_ui_set/sliced_clean/by_type/screens/source_07_215_658x301.png',
    lobby: '/assets/ui/complete_ui_set/sliced_clean/by_type/screens/source_08_121_731x364.png',
    player: '/assets/ui/complete_ui_set/sliced_clean/by_type/screens/source_09_191_521x435.png',
    host: '/assets/ui/complete_ui_set/sliced_clean/by_type/screens/source_10_105_636x517.png',
    verification: '/assets/ui/complete_ui_set/sliced_clean/by_type/screens/source_11_064_393x351.png',
    queue: '/assets/ui/complete_ui_set/sliced_clean/by_type/screens/source_12_105_732x490.png',
    winner: '/assets/ui/complete_ui_set/sliced_clean/by_type/screens/source_13_141_467x256.png',
    party: '/assets/ui/complete_ui_set/sliced_clean/by_type/screens/source_15_112_431x297.png',
  },
  styleKit: {
    title: '/assets/ui/complete_ui_set/sliced_clean/by_type/screens/source_06_001_663x230.png',
    panel: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_06_094_241x214.png',
    card: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_06_095_160x217.png',
    qrJoin: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_06_119_225x300.png',
    timer: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_06_120_226x201.png',
    playNow: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_06_172_212x73.png',
    viewCards: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_06_173_162x57.png',
    inviteFriends: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_06_174_167x57.png',
    leaveGame: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_06_175_162x57.png',
    musicToggle: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_06_188_192x39.png',
    sfxToggle: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_06_208_192x38.png',
  },
  tv: {
    header: '/assets/ui/complete_ui_set/sliced_clean/by_type/components/source_07_072_1264x109.png',
    timerFrame: '/assets/ui/complete_ui_set/sliced_clean/by_type/screens/source_07_081_426x424.png',
    songBanner: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_07_089_538x171.png',
    prizeBadge: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_07_143_175x211.png',
    winnerBanner: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_07_144_364x175.png',
    ticker: '/assets/ui/complete_ui_set/sliced_clean/by_type/components/source_07_159_982x45.png',
  },
  player: {
    title: '/assets/ui/complete_ui_set/sliced_clean/by_type/components/source_09_001_798x103.png',
    emptyCard: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_09_035_168x171.png',
    coveredCard: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_09_036_168x172.png',
    calledCard: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_09_037_167x172.png',
    bonusCard: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_09_038_169x174.png',
    lipSyncCard: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_09_033_171x176.png',
    mark: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_09_227_124x60.png',
    undo: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_09_228_125x60.png',
    confirm: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_09_229_131x60.png',
    bottomNav: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_09_286_537x102.png',
  },
  host: {
    title: '/assets/ui/complete_ui_set/sliced_clean/by_type/screens/source_10_001_583x242.png',
    liveRound: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_10_045_500x180.png',
    callSong: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_10_103_139x79.png',
    skipSong: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_10_104_136x79.png',
    nextSong: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_10_060_203x66.png',
    pauseRound: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_10_058_144x72.png',
    endRound: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_10_059_144x72.png',
    hostNotes: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_10_112_286x222.png',
    songHistory: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_10_119_281x248.png',
  },
  verify: {
    valid: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_11_024_165x61.png',
    expired: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_11_025_175x61.png',
    trespass: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_11_026_179x61.png',
    privateMember: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_11_055_208x54.png',
    cardNumber: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_11_056_159x54.png',
    djEnters: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_11_057_312x52.png',
    cardOwner: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_11_135_172x61.png',
    entryVerified: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_11_172_267x75.png',
    verifyCard: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_11_146_184x53.png',
    rejectCard: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_11_147_192x53.png',
    keypad: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_11_088_237x351.png',
    result: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_11_089_312x286.png',
    qrFrame: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_11_087_239x270.png',
    checkInPanel: '/assets/ui/complete_ui_set/sliced_clean/by_type/screens/source_11_064_393x351.png',
  },
  queue: {
    title: '/assets/ui/complete_ui_set/sliced_clean/by_type/components/source_12_001_929x77.png',
    nowPlaying: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_12_014_267x165.png',
    queuePanel: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_12_013_248x296.png',
    roundTracker: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_12_009_201x45.png',
    songQueue: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_12_005_212x46.png',
    callOrder: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_12_008_129x47.png',
    allSongs: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_12_106_93x34.png',
    hipHop: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_12_109_80x31.png',
    rb: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_12_117_81x31.png',
    country: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_12_118_82x31.png',
    dance: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_12_128_80x30.png',
  },
  winner: {
    title: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_13_001_553x190.png',
    spotlight: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_13_023_227x358.png',
    prize: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_13_093_274x211.png',
    payout: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_13_098_303x206.png',
    first: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_13_051_259x93.png',
    second: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_13_056_259x93.png',
    third: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_13_059_259x93.png',
    correct: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_13_094_162x39.png',
    wrong: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_13_095_161x39.png',
    bingo: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_13_096_170x39.png',
    missed: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_13_097_167x39.png',
  },
  party: {
    title: '/assets/ui/complete_ui_set/sliced_clean/by_type/screens/source_15_001_663x228.png',
    mode: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_15_014_143x104.png',
    battlez: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_15_015_160x104.png',
    notEnough: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_15_016_128x103.png',
    quickPlay: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_15_017_110x100.png',
    startBattle: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_15_121_442x175.png',
    battleCard: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_15_046_225x205.png',
    hypeMeter: '/assets/ui/complete_ui_set/sliced_clean/by_type/components/source_15_045_566x162.png',
    reaction1: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_15_129_61x67.png',
    reaction2: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_15_130_61x68.png',
    reaction3: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_15_131_61x68.png',
    reaction4: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_15_132_61x68.png',
  },
  digits: [
    '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_16_001_198x257.png',
    '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_16_002_131x262.png',
    '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_16_003_181x259.png',
    '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_16_004_184x258.png',
    '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_16_005_210x257.png',
    '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_16_006_185x258.png',
    '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_16_010_195x257.png',
    '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_16_007_189x256.png',
    '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_16_008_194x261.png',
    '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_16_009_192x258.png',
  ],
};

const screens = [
  {
    id: 'home',
    label: 'Menus',
    eyebrow: 'HITMANS VIP',
    title: 'After Spot Main Menu',
    detail: 'Member access, staff check-in, Lip Sync Bingo, and host controls.',
  },
  {
    id: 'payVerify',
    label: 'Pay & Verify',
    eyebrow: 'Front Door',
    title: 'Pay & Verify Entry',
    detail: 'In-person payment, member lookup, staff verification, and venue entry decision.',
  },
  {
    id: 'memberHome',
    label: 'Home',
    eyebrow: 'Member App',
    title: 'Home',
    detail: 'Member overview, quick status, pass summary, and access shortcuts.',
  },
  {
    id: 'myPass',
    label: 'My Pass',
    eyebrow: 'Member Access',
    title: 'My Pass',
    detail: 'Member pass, tier status, QR access, and renewal status.',
  },
  {
    id: 'membership',
    label: 'Membership',
    eyebrow: 'Member Access',
    title: 'Membership',
    detail: 'Tier cards, tier chips, plan ribbons, and member plan actions.',
  },
  {
    id: 'eventAccess',
    label: 'Event Access',
    eyebrow: 'Member Access',
    title: 'Event Access',
    detail: 'Events and activations available to the member.',
  },
  {
    id: 'venueAccess',
    label: 'Venue Access',
    eyebrow: 'Member Access',
    title: 'Venue Access',
    detail: 'Venue permissions and access status.',
  },
  {
    id: 'profile',
    label: 'Profile',
    eyebrow: 'Member Account',
    title: 'Profile',
    detail: 'Account, role, and preference controls.',
  },
  {
    id: 'history',
    label: 'History',
    eyebrow: 'Member Account',
    title: 'History',
    detail: 'Check-ins, entries, and activity history.',
  },
  {
    id: 'staffDashboard',
    label: 'Dashboard',
    eyebrow: 'Staff Check-In',
    title: 'Dashboard',
    detail: 'Door status and check-in overview.',
  },
  {
    id: 'searchMember',
    label: 'Search Member',
    eyebrow: 'Staff Check-In',
    title: 'Search Member',
    detail: 'Find a member by name or member number.',
  },
  {
    id: 'checkInLog',
    label: 'Check-In Log',
    eyebrow: 'Staff Check-In',
    title: 'Check-In Log',
    detail: 'Recent door decisions and check-in history.',
  },
  {
    id: 'pricingDigits',
    label: 'Price Digits',
    eyebrow: 'Dynamic Display',
    title: 'Price / Number Display',
    detail: 'Reusable numeric rendering for prices, counts, and codes.',
  },
  {
    id: 'entry',
    label: 'Entry',
    eyebrow: 'Door Check-In',
    title: 'Member Entry',
    detail: 'Live pass checks, staff scan actions, grant/deny states, and role chips.',
  },
  {
    id: 'bingoStyle',
    label: 'Bingo Style',
    eyebrow: 'Lip Sync Bingo',
    title: 'Game Menu',
    detail: 'Bingo-specific buttons, tabs, panels, timers, rewards, and selectors.',
  },
  {
    id: 'tv',
    label: 'TV Display',
    eyebrow: 'Room Display',
    title: 'TV Live Display',
    detail: 'Fullscreen public display for timer, current song, winners, prize, and ticker.',
  },
  {
    id: 'lobby',
    label: 'Lobby',
    eyebrow: 'Lip Sync Bingo',
    title: 'Lip Sync Bingo Lobby',
    detail: 'Join, ready, party mode, invite, tabs, and lobby status screen.',
  },
  {
    id: 'playerCard',
    label: 'Player Card',
    eyebrow: 'Player Game',
    title: 'Bingo Card',
    detail: 'Player card, current song, card states, navigation, mark/undo/confirm screen.',
  },
  {
    id: 'host',
    label: 'Host',
    eyebrow: 'Operator',
    title: 'Host / DJ Control',
    detail: 'Host controls, round selector, queue, notes, song history, and warning states.',
  },
  {
    id: 'verification',
    label: 'Verify',
    eyebrow: 'Host Approval',
    title: 'Card Verification',
    detail: 'QR scan, keypad, member validation, result banners, and entry status.',
  },
  {
    id: 'songQueue',
    label: 'Queue',
    eyebrow: 'Host Tools',
    title: 'Song Queue / Call History',
    detail: 'Queue, now playing, previous calls, filters, objectives, and round tracking.',
  },
  {
    id: 'winner',
    label: 'Winner',
    eyebrow: 'Rewards',
    title: 'Winner Validation / Payout',
    detail: 'Bingo validation, pattern checks, prize badges, ranks, and host approval.',
  },
  {
    id: 'checkout',
    label: 'Checkout',
    eyebrow: 'Checkout',
    title: 'Payment Methods',
    detail: 'Payment buttons only. Dues, card packs, and sheet example values stay out.',
  },
  {
    id: 'party',
    label: 'Party Mode',
    eyebrow: 'Party Mode',
    title: 'Party Mode Battlez',
    detail: 'Battle mode, audience voting, hype meter, teams, and reaction screen.',
  },
];

const loadingPhases = [
  { until: 25, label: 'Access', message: 'Securing access' },
  { until: 55, label: 'Pass', message: 'Verifying pass' },
  { until: 82, label: 'Venue', message: 'Opening venue' },
  { until: 100, label: 'Ready', message: 'Ready' },
];

const appMenus = [
  {
    title: 'Member App',
    subtitle: 'Recommended menu flow',
    items: [
      { title: 'Home', detail: 'Overview and quick status', chip: ui.chips.active, target: 'memberHome' },
      { title: 'My Pass', detail: 'View pass and tier status', chip: ui.chips.vip, target: 'myPass' },
      { title: 'Event Access', detail: 'Events you can attend', chip: ui.chips.checkedIn, target: 'eventAccess' },
      { title: 'Venue Access', detail: 'Venues you can access', chip: ui.chips.active, target: 'venueAccess' },
      { title: 'Profile', detail: 'Account and preferences', chip: ui.chips.vip, target: 'profile' },
      { title: 'History', detail: 'Past entries and activity', chip: ui.chips.checkedIn, target: 'history' },
    ],
  },
  {
    title: 'Staff Check-In',
    subtitle: 'Staff verification flow',
    items: [
      { title: 'Dashboard', detail: 'Overview and stats', chip: ui.chips.staff, target: 'staffDashboard' },
      { title: 'Scan App', detail: 'Scan member QR code', chip: ui.chips.active, target: 'payVerify' },
      { title: 'Search Member', detail: 'Search by name or ID', chip: ui.chips.checkedIn, target: 'searchMember' },
      { title: 'Verify Tier', detail: 'Check plan and status', chip: ui.chips.vip, target: 'verification' },
      { title: 'Grant / Deny Entry', detail: 'Approve or deny access', chip: ui.chips.staff, target: 'entry' },
      { title: 'Check-In Log', detail: 'View entry history', chip: ui.chips.checkedIn, target: 'checkInLog' },
    ],
  },
];

const mainMenuUi = {
  logo: '/assets/ui/new_main_menu/optimized/brand/mm_logo_badge.png',
  topbar: '/assets/ui/new_main_menu/optimized/bars/mm_topbar_shell.png',
  menuIcon: '/assets/ui/new_main_menu/optimized/bars/mm_menu_icon.png',
  hitkoinIcon: '/assets/ui/new_main_menu/optimized/bars/topbar_hitkoin_icon.png',
  ticketsIcon: '/assets/ui/new_main_menu/optimized/bars/topbar_ticket_icon.png',
  notificationIcon: '/assets/ui/new_main_menu/optimized/bars/topbar_bell_icon.png',
  navRail: '/assets/ui/new_main_menu/optimized/navigation/mm_nav_rail.png',
  railRowFrame: '/assets/ui/new_main_menu/support/support_frame_long.png',
  hero: '/assets/ui/new_main_menu/optimized/hero/mm_hero_banner.png',
  tabBar: '/assets/ui/new_main_menu/optimized/components/mm_tab_bar.png',
  quickInvite: '/assets/ui/new_main_menu/optimized/components/mm_chip_quick_invite.png',
  quickCheckin: '/assets/ui/new_main_menu/optimized/components/mm_chip_quick_checkin.png',
  bannerGranted: '/assets/ui/new_main_menu/optimized/components/mm_banner_granted.png',
  cards: [
    { title: 'Home', src: '/assets/ui/new_main_menu/optimized/cards/mm_card_home.png', target: 'memberHome' },
    { title: 'My Pass', src: '/assets/ui/new_main_menu/optimized/cards/mm_card_mypass.png', target: 'myPass' },
    { title: 'Event Access', src: '/assets/ui/new_main_menu/optimized/cards/mm_card_event_access.png', target: 'eventAccess' },
    { title: 'Venue Access', src: '/assets/ui/new_main_menu/optimized/cards/mm_card_venue_access.png', target: 'venueAccess' },
    { title: 'Profile', src: '/assets/ui/new_main_menu/optimized/cards/mm_card_profile.png', target: 'profile' },
    { title: 'History', src: '/assets/ui/new_main_menu/optimized/cards/mm_card_history.png', target: 'history' },
    { title: 'Staff Check-In', src: '/assets/ui/new_main_menu/optimized/cards/mm_card_staff_checkin.png', target: 'staffDashboard' },
    { title: 'Scan QR', src: '/assets/ui/new_main_menu/optimized/cards/mm_card_scan_qr.png', target: 'payVerify' },
    { title: 'Search Member', src: '/assets/ui/new_main_menu/optimized/cards/mm_card_search_member.png', target: 'searchMember' },
    { title: 'Verify Tier', src: '/assets/ui/new_main_menu/optimized/cards/mm_card_verify_tier.png', target: 'verification' },
    { title: 'Grant / Deny Entry', src: '/assets/ui/new_main_menu/optimized/cards/mm_card_grant_deny.png', target: 'entry' },
    { title: 'Check-In Log', src: '/assets/ui/new_main_menu/optimized/cards/mm_card_checkin_log.png', target: 'checkInLog' },
  ],
  rail: [
    { title: 'Home', target: 'memberHome', icon: '/assets/ui/new_main_menu/icons/icon_home.png' },
    { title: 'Events', target: 'eventAccess', icon: '/assets/ui/new_main_menu/icons/icon_events.png' },
    { title: 'Membership', target: 'membership', icon: '/assets/ui/new_main_menu/icons/icon_membership.png' },
    { title: 'Wallet', target: 'checkout', icon: '/assets/ui/new_main_menu/icons/icon_wallet.png' },
    { title: 'Settings', target: 'profile', icon: '/assets/ui/new_main_menu/icons/icon_settings.png' },
  ],
  tabs: [
    { title: 'Home', target: 'memberHome' },
    { title: 'Events', target: 'eventAccess' },
    { title: 'Membership', target: 'membership' },
    { title: 'Wallet', target: 'checkout' },
    { title: 'Settings', target: 'profile' },
  ],
};

function getInitialScreen() {
  const params = new URLSearchParams(window.location.search);
  const requested = params.get('screen');
  return screens.some((screen) => screen.id === requested) ? requested : 'home';
}

function App() {
  const initialScreen = getInitialScreen();
  const [activeScreen, setActiveScreen] = useState(initialScreen);
  const [targetScreen, setTargetScreen] = useState(initialScreen);
  const [transition, setTransition] = useState({
    active: false,
    from: 'Loading',
    to: 'After Spot Access Hub',
    progress: 100,
    phase: loadingPhases.at(-1).label,
    message: loadingPhases.at(-1).message,
  });

  const current = screens.find((screen) => screen.id === activeScreen) ?? screens[0];

  useEffect(() => {
    runTransition('Boot', current.title, () => setActiveScreen(initialScreen));
  }, []);

  function phaseFor(progress) {
    return loadingPhases.find((phase) => progress <= phase.until) ?? loadingPhases.at(-1);
  }

  function runTransition(from, to, commit) {
    const duration = from === 'Boot' ? 1550 : 1050;
    let committed = false;
    let timerId = 0;
    const startedAt = performance.now();

    setTransition({
      active: true,
      from,
      to,
      progress: 0,
      phase: loadingPhases[0].label,
      message: loadingPhases[0].message,
    });

    const frame = () => {
      const now = performance.now();
      const t = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const progress = Math.min(100, Math.round(eased * 100));
      const phase = phaseFor(progress);

      if (!committed && progress >= 72) {
        committed = true;
        commit();
      }

      setTransition({
        active: true,
        from,
        to,
        progress,
        phase: phase.label,
        message: phase.message,
      });

      if (progress >= 100) {
        window.clearInterval(timerId);
        window.setTimeout(() => {
          setTransition((state) => ({ ...state, active: false, progress: 100 }));
        }, 180);
        return;
      }
    };

    frame();
    timerId = window.setInterval(frame, 32);
    return () => window.clearInterval(timerId);
  }

  function navigate(nextId) {
    if (nextId === activeScreen || transition.active) return;
    const next = screens.find((screen) => screen.id === nextId);
    if (!next) return;
    setTargetScreen(nextId);
    runTransition(current.title, next.title, () => {
      setActiveScreen(nextId);
      setTargetScreen(nextId);
    });
  }

  return (
    <main className="app-shell menu-shell">
      <div className="dynamic-bg" aria-hidden="true">
        <span className="dynamic-bg-layer dynamic-bg-hitkoin" />
        <span className="dynamic-bg-layer dynamic-bg-vip" />
      </div>
      <TransitionOverlay transition={transition} destination={targetScreen} />
      <section className={`screen screen-${current.id}`}>
        {current.id !== 'home' && <ScreenHeader screen={current} onBack={() => navigate('home')} />}
        <ScreenBody activeScreen={current.id} navigate={navigate} />
      </section>
    </main>
  );
}

function TransitionOverlay({ transition }) {
  const overlayStyle = {
    '--progress': transition.progress,
    '--progress-pct': `${transition.progress}%`,
  };

  return (
    <div className={transition.active ? 'transition-overlay active' : 'transition-overlay'} style={overlayStyle} aria-hidden={!transition.active}>
      <div className="transition-frame">
        <div className="transition-bg" />
        <div className="source-progress-shell" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={transition.progress}>
          <span />
        </div>
      </div>
    </div>
  );
}

function ScreenHeader({ screen, onBack }) {
  return (
    <header className="screen-header compact-return" aria-label={`${screen.title} navigation`}>
      <button className="back-to-menu" type="button" onClick={onBack}>Home</button>
    </header>
  );
}

function ScreenBody({ activeScreen, navigate }) {
  if (activeScreen === 'home') return <HomeScreen navigate={navigate} />;
  if (activeScreen === 'payVerify') return <PayVerifyScreen navigate={navigate} />;
  if (activeScreen === 'memberHome') return <MemberHomeScreen navigate={navigate} />;
  if (activeScreen === 'myPass') return <PassScreen navigate={navigate} />;
  if (activeScreen === 'membership') return <MembershipScreen navigate={navigate} />;
  if (activeScreen === 'eventAccess') return <EventScreen navigate={navigate} />;
  if (activeScreen === 'venueAccess') return <VenueScreen navigate={navigate} />;
  if (activeScreen === 'profile') return <ProfileScreen navigate={navigate} />;
  if (activeScreen === 'history') return <HistoryScreen navigate={navigate} />;
  if (activeScreen === 'staffDashboard') return <StaffDashboardScreen navigate={navigate} />;
  if (activeScreen === 'searchMember') return <SearchMemberScreen navigate={navigate} />;
  if (activeScreen === 'checkInLog') return <CheckInLogScreen navigate={navigate} />;
  if (activeScreen === 'pricingDigits') return <PricingDigitsScreen navigate={navigate} />;
  if (activeScreen === 'entry') return <EntryScreen navigate={navigate} />;
  if (activeScreen === 'bingoStyle') return <BingoStyleScreen navigate={navigate} />;
  if (activeScreen === 'tv') return <TvDisplayScreen navigate={navigate} />;
  if (activeScreen === 'lobby') return <LobbyScreen navigate={navigate} />;
  if (activeScreen === 'playerCard') return <PlayerCardScreen navigate={navigate} />;
  if (activeScreen === 'host') return <HostScreen navigate={navigate} />;
  if (activeScreen === 'verification') return <VerificationScreen navigate={navigate} />;
  if (activeScreen === 'songQueue') return <SongQueueScreen navigate={navigate} />;
  if (activeScreen === 'winner') return <WinnerScreen navigate={navigate} />;
  if (activeScreen === 'checkout') return <CheckoutScreen navigate={navigate} />;
  return <PartyScreen navigate={navigate} />;
}

function HomeScreen({ navigate }) {
  const [railOpen, setRailOpen] = useState(() => new URLSearchParams(window.location.search).get('rail') === 'open');
  const memberData = null;
  const liveStatus = null;
  const hitkoinTotal = null;
  const ticketTotal = null;
  const notificationTotal = null;

  function go(target) {
    setRailOpen(false);
    navigate(target);
  }

  return (
    <div className={railOpen ? 'main-menu-blueprint rail-open' : 'main-menu-blueprint'} aria-label="After Spot main menu">
      {railOpen && <button className="main-menu-rail-backdrop" type="button" onClick={() => setRailOpen(false)} aria-label="Close menu" />}

      <aside className="main-menu-rail" aria-hidden={!railOpen}>
        <div className="main-menu-rail-wrap">
          {mainMenuUi.rail.map((item) => (
            <button
              className="main-menu-rail-row"
              type="button"
              key={item.title}
              onClick={() => go(item.target)}
              aria-label={item.title}
            >
              <span className="main-menu-rail-row-frame" aria-hidden="true" style={{ backgroundImage: `url(${mainMenuUi.railRowFrame})` }} />
              <img src={item.icon} alt="" />
              <span>{item.title}</span>
            </button>
          ))}
        </div>
      </aside>

      <section className="main-menu-device">
        <div className="main-menu-topbar">
          <img src={mainMenuUi.topbar} alt="" />
          {memberData && (
            <div className="main-menu-live-member">
              <span>{memberData.greeting}</span>
              <strong>{memberData.name}</strong>
              <small>{memberData.level}</small>
            </div>
          )}
          <button className="topbar-live-chip topbar-hitkoin" type="button" onClick={() => go('checkout')} aria-label="Hitkoin wallet">
            <img src={mainMenuUi.hitkoinIcon} alt="" />
            {hitkoinTotal !== null && <span>{hitkoinTotal}</span>}
          </button>
          <button className="topbar-live-chip topbar-tickets" type="button" onClick={() => go('eventAccess')} aria-label="VIP tickets">
            <img src={mainMenuUi.ticketsIcon} alt="" />
            {ticketTotal !== null && <span>{ticketTotal}</span>}
          </button>
          <button className="topbar-icon-button topbar-notifications" type="button" onClick={() => go('history')} aria-label="Notifications">
            <img src={mainMenuUi.notificationIcon} alt="" />
            {notificationTotal !== null && <span>{notificationTotal}</span>}
          </button>
          <button className="main-menu-toggle topbar-icon-button topbar-menu" type="button" onClick={() => setRailOpen(true)} aria-label="Open menu">
            <img src={mainMenuUi.menuIcon} alt="" />
          </button>
        </div>

        <div className="main-menu-hero">
          <img src={mainMenuUi.hero} alt="" />
          <button className="hero-hotspot" type="button" onClick={() => go('membership')} aria-label="Explore membership" />
        </div>

        <div className="main-menu-card-grid">
          {mainMenuUi.cards.map((card) => (
            <button className="main-menu-card" type="button" key={card.title} onClick={() => go(card.target)} aria-label={card.title}>
              <img src={card.src} alt="" />
            </button>
          ))}
        </div>

        <div className={liveStatus ? 'main-menu-status-strip' : 'main-menu-status-strip is-empty'} aria-label="Quick actions">
          <button className="main-menu-strip-action" type="button" onClick={() => go('party')} aria-label="Invite and earn">
            <img src={mainMenuUi.quickInvite} alt="" />
          </button>
          <span>{liveStatus ?? ''}</span>
          <button className="main-menu-strip-action" type="button" onClick={() => go('payVerify')} aria-label="Check in member">
            <img src={mainMenuUi.quickCheckin} alt="" />
          </button>
        </div>

        <div className="main-menu-tabs">
          <img src={mainMenuUi.tabBar} alt="" />
          {mainMenuUi.tabs.map((item, index) => (
            <button
              className="main-menu-hotspot tab-hotspot"
              style={{ '--index': index }}
              type="button"
              key={item.title}
              onClick={() => go(item.target)}
              aria-label={item.title}
            />
          ))}
          <button
            className="main-menu-hotspot tab-logo-hotspot"
            type="button"
            onClick={() => setRailOpen(true)}
            aria-label="Open menu"
          />
        </div>
      </section>
    </div>
  );
}

function MemberHomeScreen() {
  return (
    <MenuWorkspace eyebrow="Member App" title="Home" layout="member">
      <LiveFrame title="Member Status" state="Waiting for member login or staff scan">
        <StatusStrip items={[]} />
      </LiveFrame>
      <FlowCard title="Quick Access" steps={['My Pass', 'Event Access', 'Venue Access']} />
    </MenuWorkspace>
  );
}

function PayVerifyScreen() {
  const [selectedTier, setSelectedTier] = useState(null);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [verified, setVerified] = useState(false);
  const selectedPass = selectedTier ? ui.passes.find((pass) => pass.name === selectedTier) : null;
  const verificationReady = Boolean(selectedTier && selectedPayment && verified);

  return (
    <div className="door-preview-flow">
      <section className="preview-device member-device">
        <header className="preview-device-header">
          <span>Member App</span>
          <strong>Pay & Pass</strong>
        </header>

        <div className="member-pass-preview">
          <img src={selectedPass?.src ?? mainMenuUi.logo} alt="" />
          <div className="member-pass-live-copy">
            <span>Selected Plan</span>
            <strong>{selectedTier ?? 'Choose Plan'}</strong>
            <small>{selectedPayment ?? 'Choose payment method'}</small>
            <StatusStrip items={selectedTier ? [ui.chips.active, selectedTier === 'VIP' ? ui.chips.vip : ui.chips.checkedIn] : []} />
          </div>
          <div className="qr-placeholder">{verificationReady ? 'PASS' : 'QR'}</div>
        </div>

        <div className="preview-wallet-strip">
          {ui.tiers.map((tier) => (
            <button
              className={selectedTier === tier.name ? 'preview-pass-button selected' : 'preview-pass-button'}
              type="button"
              key={tier.name}
              onClick={() => setSelectedTier(tier.name)}
              aria-label={`Select ${tier.name} plan`}
            >
              <img src={tier.src} alt="" />
              <span>{tier.name}</span>
            </button>
          ))}
        </div>

        <div className="preview-payment-grid" aria-label="Payment methods">
          {ui.paymentMethods.map((method) => (
            <button
              className={selectedPayment === method.label ? 'image-action selected' : 'image-action'}
              type="button"
              key={method.label}
              onClick={() => setSelectedPayment(method.label)}
              aria-label={method.label}
            >
              <img src={method.src} alt="" />
            </button>
          ))}
        </div>
      </section>

      <section className="preview-device staff-device">
        <header className="preview-device-header">
          <span>Staff Check-In</span>
          <strong>Verification</strong>
        </header>

        <div className="staff-preview-top">
          <label>
            <span>Search Member</span>
            <input type="text" placeholder="Name, phone, or member ID" />
          </label>
          <label>
            <span>Manual Card Number</span>
            <input type="text" placeholder="Enter card number" />
          </label>
        </div>

        <div className="staff-preview-main">
          <div className="staff-check-panel">
            <img src={ui.verify.checkInPanel} alt="" />
          </div>
          <div className="staff-result-panel">
            <img src={verificationReady ? ui.banners.granted : ui.banners.denied} alt="" />
            <StatusStrip items={verificationReady ? [ui.verify.valid, ui.verify.cardOwner] : [ui.verify.cardNumber, ui.verify.privateMember]} />
          </div>
        </div>

        <div className="preview-action-grid">
          <AssetButton src={ui.buttons.scan} label="Scan App" />
          <AssetButton src={ui.buttons.manual} label="Manual Check-In" />
          <button className="image-action" type="button" onClick={() => setVerified(true)} aria-label="Verify Member">
            <img src={ui.verify.verifyCard} alt="" />
          </button>
          <AssetButton src={ui.verify.rejectCard} label="Reject Card" />
        </div>
      </section>

      <section className="door-preview-decision">
        <div>
          <span>Door Verification</span>
          <strong>{verificationReady ? 'Ready To Grant Entry' : 'Select Plan, Take Payment, Verify'}</strong>
        </div>
        <img src={verificationReady ? ui.banners.granted : ui.banners.denied} alt="" />
        <div className="preview-action-grid final-actions">
          <AssetButton src={ui.buttons.rescan} label="Rescan" />
          <AssetButton src={ui.buttons.grant} label="Grant Entry" />
          <AssetButton src={ui.buttons.deny} label="Deny Entry" />
        </div>
      </section>
    </div>
  );
}

function MembershipScreen({ navigate }) {
  return (
    <MenuWorkspace eyebrow="Member Access" title="Membership" layout="member">
      <LiveFrame title="Tier Selection" state="Prices and plan status load from system settings">
        <div className="tier-live-grid compact">
          {ui.tiers.map((tier) => (
            <button className="image-action tile-image-button tier-card-live" type="button" key={tier.name} aria-label={`${tier.name} tier`}>
              <img src={tier.src} alt="" />
            </button>
          ))}
        </div>
      </LiveFrame>
      <FlowCard title="Plan Flow" steps={['Select tier', 'Take payment', 'Issue pass', 'Verify at door']} />
      <ActionStack
        title="Plan Actions"
        navigate={navigate}
        actions={ui.planActions.map((action) => ({ src: action.src, label: action.label, target: 'checkout' }))}
      />
    </MenuWorkspace>
  );
}

function PricingDigitsScreen({ navigate }) {
  return (
    <MenuWorkspace eyebrow="Dynamic Display" title="Price / Number Display" layout="member">
      <LiveFrame title="Digit Library" state="Numbers render from live pricing and counts">
        <div className="digit-asset-strip compact">
          {ui.digits.map((digit, index) => (
            <img src={digit} alt="" key={`${digit}-${index}`} />
          ))}
        </div>
      </LiveFrame>
      <FlowCard title="Display Rules" steps={['Use digits only', 'Bind values to data', 'Keep examples hidden']} />
      <ActionStack
        title="Payment Actions"
        navigate={navigate}
        actions={ui.planActions.map((action) => ({ src: action.src, label: action.label, target: 'checkout' }))}
      />
    </MenuWorkspace>
  );
}

function EntryScreen({ navigate }) {
  return (
    <MenuWorkspace eyebrow="Door Check-In" title="Member Entry" layout="staff">
      <LiveFrame title="Pass Check" state="Scan a member pass or enter member number">
        <div className="pass-card-empty">
          <img src={mainMenuUi.logo} alt="" />
          <div className="qr-placeholder">QR</div>
        </div>
      </LiveFrame>
      <FlowCard title="Entry Flow" steps={['Scan app', 'Verify tier', 'Check venue rules', 'Grant or deny']} />
      <ActionStack
        title="Door Actions"
        navigate={navigate}
        actions={[
          { src: ui.buttons.scan, label: 'Scan App', target: 'payVerify' },
          { src: ui.buttons.manual, label: 'Manual Check-In', target: 'searchMember' },
          { src: ui.buttons.grant, label: 'Grant Entry', target: 'checkInLog' },
          { src: ui.buttons.deny, label: 'Deny Entry', target: 'checkInLog' },
        ]}
      />
    </MenuWorkspace>
  );
}

function BingoStyleScreen() {
  return (
    <MenuWorkspace eyebrow="Lip Sync Bingo" title="Game Menu" layout="member">
      <LiveFrame title="Game Status" state="Game data loads when a room is created">
        <StatusStrip items={[ui.chips.active, ui.chips.vip]} />
      </LiveFrame>
      <FlowCard title="Game Flow" steps={['Join lobby', 'Confirm pass', 'Start round', 'Track rewards']} />
      <ActionStack title="Game Actions" actions={[ui.bingo.join, ui.bingo.ready, ui.bingo.party]} />
    </MenuWorkspace>
  );
}

function TvDisplayScreen() {
  return (
    <MenuWorkspace eyebrow="Room Display" title="TV Live Display" layout="staff">
      <LiveFrame title="Display Feed" state="Public display waits for live round data">
        <div className="qr-placeholder">LIVE</div>
      </LiveFrame>
      <FlowCard title="Display Flow" steps={['Load event', 'Show current round', 'Show winners', 'Reset display']} />
      <ActionStack title="Display Controls" actions={[ui.host.nextSong, ui.host.pauseRound, ui.host.endRound]} />
    </MenuWorkspace>
  );
}

function LobbyScreen() {
  return (
    <MenuWorkspace eyebrow="Lip Sync Bingo" title="Lobby" layout="member">
      <LiveFrame title="Lobby Status" state="No live room selected">
        <div className="qr-placeholder">ROOM</div>
      </LiveFrame>
      <FlowCard title="Lobby Flow" steps={['Create room', 'Invite members', 'Ready players', 'Launch game']} />
      <ActionStack title="Lobby Actions" actions={[ui.bingo.join, ui.bingo.ready, ui.bingo.party]} />
    </MenuWorkspace>
  );
}

function PlayerCardScreen() {
  return (
    <MenuWorkspace eyebrow="Player Game" title="Bingo Card" layout="member">
      <LiveFrame title="Player Card" state="Card appears after player joins a live room">
        <BingoCard compact />
      </LiveFrame>
      <FlowCard title="Player Flow" steps={['Join room', 'Receive card', 'Mark calls', 'Submit bingo']} />
      <ActionStack title="Card Actions" actions={[ui.player.mark, ui.player.undo, ui.player.confirm]} />
    </MenuWorkspace>
  );
}

function HostScreen() {
  return (
    <MenuWorkspace eyebrow="Operator" title="Host / DJ Control" layout="staff">
      <LiveFrame title="Round Control" state="Host tools activate after a room is selected">
        <QueueRows />
      </LiveFrame>
      <FlowCard title="Host Flow" steps={['Create round', 'Call song', 'Review claims', 'Close round']} />
      <ActionStack title="Host Actions" actions={[ui.host.callSong, ui.host.skipSong, ui.host.nextSong, ui.host.pauseRound]} />
    </MenuWorkspace>
  );
}

function VerificationScreen({ navigate }) {
  return (
    <MenuWorkspace eyebrow="Staff Check-In" title="Verify Tier" layout="staff">
      <LiveFrame title="Tier Verification" state="Scan or search a member first">
        <div className="verify-tier-live">
          <img src={ui.verify.qrFrame} alt="" />
          <StatusStrip items={[ui.verify.cardNumber, ui.verify.privateMember]} />
        </div>
      </LiveFrame>
      <FlowCard title="Decision Flow" steps={['Load member', 'Check plan', 'Confirm venue access', 'Open entry decision']} />
      <ActionStack
        title="Tier Actions"
        navigate={navigate}
        actions={[
          { src: ui.verify.verifyCard, label: 'Verify Card', target: 'entry' },
          { src: ui.verify.rejectCard, label: 'Reject Card', target: 'checkInLog' },
          { src: ui.buttons.manual, label: 'Manual Check-In', target: 'searchMember' },
        ]}
      />
    </MenuWorkspace>
  );
}

function SongQueueScreen() {
  return (
    <MenuWorkspace eyebrow="Host Tools" title="Song Queue / Call History" layout="staff">
      <LiveFrame title="Queue" state="Song queue loads from the host session">
        <QueueRows />
      </LiveFrame>
      <FlowCard title="Queue Flow" steps={['Add songs', 'Call next', 'Track history', 'Lock round']} />
      <ActionStack title="Queue Actions" actions={[ui.host.callSong, ui.host.nextSong, ui.host.pauseRound]} />
    </MenuWorkspace>
  );
}

function WinnerScreen() {
  return (
    <MenuWorkspace eyebrow="Rewards" title="Winner Validation / Payout" layout="staff">
      <LiveFrame title="Claim Review" state="Claims appear after a player submits bingo">
        <StatusStrip items={[ui.verify.cardNumber, ui.verify.privateMember]} />
      </LiveFrame>
      <FlowCard title="Winner Flow" steps={['Review card', 'Confirm pattern', 'Approve reward', 'Log payout']} />
      <ActionStack title="Winner Actions" actions={[ui.verify.verifyCard, ui.verify.rejectCard, ui.buttons.manual]} />
    </MenuWorkspace>
  );
}

function CheckoutScreen({ navigate }) {
  return (
    <MenuWorkspace eyebrow="Checkout" title="Payment Methods" layout="member">
      <LiveFrame title="Payment Step" state="Select a plan before taking payment">
        <CheckoutMethods />
      </LiveFrame>
      <FlowCard title="Checkout Flow" steps={['Select plan', 'Choose payment', 'Confirm payment', 'Issue pass']} />
      <ActionStack
        title="Plan Actions"
        navigate={navigate}
        actions={ui.planActions.map((action) => ({ src: action.src, label: action.label, target: 'membership' }))}
      />
    </MenuWorkspace>
  );
}

function PartyScreen() {
  return (
    <MenuWorkspace eyebrow="Party Mode" title="Party Mode Battlez" layout="member">
      <LiveFrame title="Battle Status" state="Battle mode waits for a host session">
        <StatusStrip items={[ui.chips.vip, ui.chips.checkedIn]} />
      </LiveFrame>
      <FlowCard title="Party Flow" steps={['Create battle', 'Invite players', 'Track reactions', 'Award winner']} />
      <ActionStack title="Party Actions" actions={[ui.party.mode, ui.party.battlez, ui.party.quickPlay]} />
    </MenuWorkspace>
  );
}

function PassScreen({ navigate }) {
  return (
    <MenuWorkspace eyebrow="Member App" title="My Pass" layout="pass">
      <LiveFrame title="Pass Card" state="No active member loaded">
        <div className="pass-card-empty">
          <img src={mainMenuUi.logo} alt="" />
          <div className="qr-placeholder">QR</div>
        </div>
      </LiveFrame>
      <WalletTierRail />
      <ActionStack
        title="Pass Actions"
        navigate={navigate}
        actions={[
          { src: ui.buttons.selectPlan, label: 'Select Plan', target: 'membership' },
          { src: ui.buttons.renewPlan, label: 'Renew Plan', target: 'checkout' },
        ]}
      />
    </MenuWorkspace>
  );
}

function EventScreen() {
  return (
    <MenuWorkspace eyebrow="Member App" title="Event Access" layout="access">
      <LiveFrame title="Available Events" state="Events populate from the venue schedule">
        <StatusStrip items={[]} />
      </LiveFrame>
      <FlowCard title="Access Logic" steps={['Choose event', 'Verify pass', 'Show QR']} />
    </MenuWorkspace>
  );
}

function VenueScreen() {
  return (
    <MenuWorkspace eyebrow="Member App" title="Venue Access" layout="access">
      <LiveFrame title="Venue Permissions" state="Access zones load after member verification">
        <StatusStrip items={[]} />
      </LiveFrame>
      <FlowCard title="Venue Flow" steps={['Confirm plan', 'Check venue rules', 'Show entry status']} />
    </MenuWorkspace>
  );
}

function StaffScreen() {
  return (
    <div className="staff-grid refined">
      <AppPanel title="Staff Verification" subtitle="Menu destination">
        <p className="panel-note">Staff verification will use live member search, scan, and tier data. Sheet panels with example fields stay as blueprints.</p>
        <div className="staff-image-actions">
          <AssetButton src={ui.buttons.scan} label="Scan App" />
          <AssetButton src={ui.buttons.verify} label="Verify Member" />
        </div>
      </AppPanel>
      <AppPanel title="Door Result" subtitle="Grant or deny entry">
        <div className="staff-actions blueprint-actions">
          <AssetButton src={ui.buttons.rescan} label="Rescan" />
          <AssetButton src={ui.buttons.grant} label="Grant Entry" />
          <AssetButton src={ui.buttons.manual} label="Manual Check-In" />
          <AssetButton src={ui.buttons.deny} label="Deny Entry" />
        </div>
      </AppPanel>
    </div>
  );
}

function StaffDashboardScreen({ navigate }) {
  return (
    <MenuWorkspace eyebrow="Staff Check-In" title="Dashboard" layout="staff">
      <LiveFrame title="Door Status" state="No live check-in session selected">
        <StatusStrip items={[ui.chips.staff, ui.chips.active]} />
      </LiveFrame>
      <FlowCard title="Staff Flow" steps={['Scan app', 'Search member', 'Verify tier', 'Grant or deny']} />
      <ActionStack
        title="Door Controls"
        navigate={navigate}
        actions={[
          { src: ui.buttons.scan, label: 'Scan App', target: 'payVerify' },
          { src: ui.buttons.manual, label: 'Manual Check-In', target: 'searchMember' },
          { src: ui.buttons.rescan, label: 'Rescan', target: 'payVerify' },
        ]}
      />
    </MenuWorkspace>
  );
}

function SearchMemberScreen({ navigate }) {
  return (
    <MenuWorkspace eyebrow="Staff Check-In" title="Search Member" layout="staff">
      <LiveFrame title="Member Lookup" state="Enter a member number, phone, or name">
        <div className="designer-search-box">
          <span>Search</span>
          <input type="text" placeholder="Member number or name" />
        </div>
      </LiveFrame>
      <FlowCard title="Lookup Flow" steps={['Search', 'Review match', 'Verify tier', 'Open decision']} />
      <ActionStack
        title="Lookup Actions"
        navigate={navigate}
        actions={[
          { src: ui.buttons.verify, label: 'Verify Member', target: 'verification' },
          { src: ui.buttons.manual, label: 'Manual Check-In', target: 'entry' },
          { src: ui.buttons.rescan, label: 'Rescan', target: 'payVerify' },
        ]}
      />
    </MenuWorkspace>
  );
}

function CheckInLogScreen({ navigate }) {
  return (
    <MenuWorkspace eyebrow="Staff Check-In" title="Check-In Log" layout="staff">
      <LiveFrame title="Recent Activity" state="No check-ins loaded yet">
        <StatusStrip items={[ui.chips.checkedIn, ui.chips.staff]} />
      </LiveFrame>
      <FlowCard title="Audit Flow" steps={['Review decision', 'Filter by staff', 'Export when connected']} />
      <ActionStack
        title="Log Actions"
        navigate={navigate}
        actions={[
          { src: ui.buttons.rescan, label: 'Rescan', target: 'payVerify' },
          { src: ui.buttons.manual, label: 'Manual Check-In', target: 'searchMember' },
        ]}
      />
    </MenuWorkspace>
  );
}

function BingoScreen() {
  return (
    <div className="bingo-grid refined">
      <AppPanel title="Lip Sync Bingo Lobby" subtitle="Menu destination">
        <p className="panel-note">Bingo lobby room codes, player counts, queues, and timers will be generated live. The sheet numbers are examples only.</p>
      </AppPanel>
      <AppPanel title="Round Status" subtitle="Host and player overview">
        <AccessRow title="Lobby" status="Ready" chip={ui.chips.active} />
        <AccessRow title="Cards" status="Menu" chip={ui.chips.checkedIn} />
        <AccessRow title="Rewards" status="Menu" chip={ui.chips.vip} />
      </AppPanel>
    </div>
  );
}

function SimpleAccessScreen({ title, rows }) {
  const chips = [ui.chips.active, ui.chips.checkedIn, ui.chips.vip];

  return (
    <div className="simple-menu-screen">
      <AppPanel title={title} subtitle="Live menu">
        {rows.map((row, index) => (
          <AccessRow
            key={row}
            title={row}
            status={index === 0 ? 'Active' : 'Ready'}
            chip={chips[index % chips.length]}
          />
        ))}
      </AppPanel>
      <AppPanel title="Member Status" subtitle="System data">
        <StatusStrip items={[ui.chips.active, ui.chips.checkedIn, ui.chips.vip]} />
        <p className="panel-note">This screen is ready for live member, venue, and event data. Sheet example text stays out of the app.</p>
      </AppPanel>
    </div>
  );
}

function ProfileScreen() {
  return (
    <MenuWorkspace eyebrow="Member Account" title="Profile" layout="member">
      <LiveFrame title="Profile Details" state="Profile fields load after account sign-in">
        <img className="profile-emblem" src={mainMenuUi.logo} alt="" />
      </LiveFrame>
      <FlowCard title="Account Areas" steps={['Contact', 'Preferences', 'Privacy']} />
    </MenuWorkspace>
  );
}

function HistoryScreen() {
  return (
    <MenuWorkspace eyebrow="Member Account" title="History" layout="member">
      <LiveFrame title="Activity Timeline" state="No member history loaded">
        <StatusStrip items={[ui.chips.checkedIn]} />
      </LiveFrame>
      <FlowCard title="History Types" steps={['Entries', 'Payments', 'Venue access']} />
    </MenuWorkspace>
  );
}

function MenuWorkspace({ eyebrow, title, layout, children }) {
  return (
    <div className={`designer-workspace designer-${layout}`}>
      <section className="designer-hero-card">
        <span>{eyebrow}</span>
        <h2>{title}</h2>
        <p>Live data appears here only after the member, venue, staff session, or payment step provides it.</p>
      </section>
      <div className="designer-content-grid">{children}</div>
    </div>
  );
}

function LiveFrame({ title, state, children }) {
  return (
    <article className="designer-panel live-frame">
      <header>
        <span>{title}</span>
        <strong>{state}</strong>
      </header>
      <div className="live-frame-body">{children}</div>
    </article>
  );
}

function FlowCard({ title, steps }) {
  return (
    <article className="designer-panel flow-card">
      <header>
        <span>{title}</span>
      </header>
      <div className="flow-step-list">
        {steps.map((step, index) => (
          <div className="flow-step" key={step}>
            <b>{index + 1}</b>
            <strong>{step}</strong>
          </div>
        ))}
      </div>
    </article>
  );
}

function ActionStack({ title, actions, navigate }) {
  return (
    <article className="designer-panel action-stack">
      <header>
        <span>{title}</span>
      </header>
      <div className="designer-action-list">
        {actions.map((action) => {
          const item = typeof action === 'string' ? { src: action, label: 'Action' } : action;
          return (
            <AssetButton
              src={item.src}
              label={item.label}
              key={`${item.src}-${item.label}`}
              onClick={item.target && navigate ? () => navigate(item.target) : undefined}
            />
          );
        })}
      </div>
    </article>
  );
}

function WalletTierRail() {
  return (
    <article className="designer-panel wallet-tier-rail">
      <header>
        <span>Membership Wallet</span>
      </header>
      <div>
        {ui.tiers.map((tier) => (
          <button className="tier-wallet-item" type="button" key={tier.name} aria-label={`${tier.name} plan`}>
            <img src={tier.src} alt="" />
          </button>
        ))}
      </div>
    </article>
  );
}

function MetricTile({ label, value }) {
  return (
    <div className="metric-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function BingoCard({ compact = false }) {
  return (
    <div className={compact ? 'bingo-card compact' : 'bingo-card'}>
      {Array.from({ length: 25 }, (_, index) => (
        <button type="button" key={index} className={index === 12 ? 'free' : index % 4 === 0 ? 'marked' : ''}>
          {index === 12 ? 'FREE' : ''}
        </button>
      ))}
    </div>
  );
}

function QueueRows() {
  return (
    <div className="queue-rows">
      {['Queued Call', 'Ready Check', 'Round Update', 'Prize Notice'].map((label, index) => (
        <div className="queue-row" key={label}>
          <b>{index + 1}</b>
          <span>{label}</span>
          <small>Live</small>
        </div>
      ))}
    </div>
  );
}

function Keypad() {
  return (
    <div className="keypad">
      {'1234567890'.split('').map((key) => (
        <button type="button" key={key}>{key}</button>
      ))}
      <button type="button">Clear</button>
      <button type="button">Enter</button>
    </div>
  );
}

function ScreenAsset({ src, className = '' }) {
  return (
    <div className={`screen-asset-card ${className}`}>
      <img src={src} alt="" />
    </div>
  );
}

function AppPanel({ title, subtitle, children, className = '' }) {
  return (
    <article className={`app-panel ${className}`}>
      <header>
        <span>{subtitle}</span>
        <h2>{title}</h2>
      </header>
      <div className="app-panel-body">{children}</div>
    </article>
  );
}

function MenuFlowRow({ chip, index, title, detail, target, onSelect }) {
  return (
    <button className="menu-flow-row" type="button" data-target={target} aria-label={`${title}. ${detail}`} onClick={onSelect}>
      <b>{index}</b>
      <img className="beveled-asset chip-asset" src={chip} alt="" />
      <div>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
    </button>
  );
}

function PlanActionGrid() {
  return (
    <div className="plan-action-grid">
      {ui.planActions.map((action) => (
        <AssetButton key={action.label} src={action.src} label={action.label} />
      ))}
    </div>
  );
}

function CheckoutMethods() {
  return (
    <div className="checkout-methods" aria-label="Payment methods">
      {ui.paymentMethods.map((method) => (
        <AssetButton key={method.label} src={method.src} label={method.label} />
      ))}
    </div>
  );
}

function AccessRow({ title, status, chip }) {
  return (
    <div className="access-row">
      <img src={chip} alt="" />
      <strong>{title}</strong>
      <span>{status}</span>
    </div>
  );
}

function InfoPanel({ title, value, chip }) {
  return (
    <article className="info-panel">
      <img src={chip} alt="" />
      <span>{title}</span>
      <strong>{value}</strong>
    </article>
  );
}

function StatusStrip({ items }) {
  return (
    <div className="status-strip">
      {items.map((item) => (
        <img className="beveled-asset chip-asset" src={item} alt="" key={item} />
      ))}
    </div>
  );
}

function AssetButton({ src, label, onClick }) {
  return (
    <button className="image-action" type="button" aria-label={label} onClick={onClick}>
      <img src={src} alt="" />
    </button>
  );
}

createRoot(document.getElementById('root')).render(<App />);

// Feature flags for the HITKOIN and WORLD layers.
//
// The names and their initial values come straight from the master directive
// (§63) and are not ours to improvise: they are how the venue turns a half-built
// economic layer off without a deploy, and how anybody auditing this can see at
// a glance what is actually live.
//
// The three CHAIN flags default OFF and stay off until somebody deliberately
// turns them on, because §63 ends with the rule that governs this whole file:
//
//     Do not fake mainnet functionality.
//
// A flag that says a chain is connected when it is not is worse than no flag.

const TRUE_ISH = new Set(['1', 'true', 'yes', 'on']);
const FALSE_ISH = new Set(['0', 'false', 'no', 'off']);

function flag(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const v = String(raw).trim().toLowerCase();
  if (TRUE_ISH.has(v)) return true;
  if (FALSE_ISH.has(v)) return false;
  return fallback;             // a typo must not silently flip a money switch
}

/** Everything on, in its directive-specified initial state. */
export function economyFlags() {
  return {
    // HITKOIN — the commerce rail. On, because the ledger and receipts work
    // without a chain; only the chain itself is gated below.
    HITK_ENABLED: flag('HITK_ENABLED', true),
    HITK_MEMBER_ACCOUNTS: flag('HITK_MEMBER_ACCOUNTS', true),
    HITK_RECEIPTS: flag('HITK_RECEIPTS', true),
    HITK_IP_REGISTRY: flag('HITK_IP_REGISTRY', true),
    HITK_RESERVE: flag('HITK_RESERVE', true),
    HITK_BOOKING_STAKES: flag('HITK_BOOKING_STAKES', true),

    // WORLD — the commons. Also on: the reserve LEDGER is bookkeeping, and
    // bookkeeping being honest is exactly what this layer is for.
    WORLD_ENABLED: flag('WORLD_ENABLED', true),
    WORLD_RESERVE_LEDGER: flag('WORLD_RESERVE_LEDGER', true),
    WORLD_PROOFVAULT: flag('WORLD_PROOFVAULT', true),
    WORLD_JUBILEE_PROGRAMS: flag('WORLD_JUBILEE_PROGRAMS', true),
    WORLD_EMERGENCY_MODE: flag('WORLD_EMERGENCY_MODE', true),
    WORLD_OFFLINE_MODE: flag('WORLD_OFFLINE_MODE', true),
    WORLD_PUBLIC_DASHBOARD: flag('WORLD_PUBLIC_DASHBOARD', true),

    // OFF, and they are off for reasons that are not convenience.
    //
    // REAL_CHAIN: nothing here has been audited or deployed. §57 and §61 both
    // require compile, test, audit, testnet — in that order — before anything
    // touches a real network.
    HITK_REAL_CHAIN: flag('HITK_REAL_CHAIN', false),
    WORLD_REAL_CHAIN: flag('WORLD_REAL_CHAIN', false),
    // AUTOMATIC_RELEASE: money leaving the reserve without a human approving it.
    // §55 says no single person controls the reserve; a machine releasing on its
    // own is the same failure with nobody to hold responsible.
    WORLD_AUTOMATIC_RELEASE: flag('WORLD_AUTOMATIC_RELEASE', false),
    WORLD_MAINNET: flag('WORLD_MAINNET', false),
  };
}

/**
 * Which network this process is talking to. §64: LOCAL, then TESTNET, and
 * MAINNET only after testing and explicit approval — so MAINNET cannot be
 * reached by setting one variable, it needs the flag as well.
 */
export function economyNetwork() {
  const want = String(process.env.ECONOMY_NETWORK || 'LOCAL').trim().toUpperCase();
  if (want === 'MAINNET') {
    return economyFlags().WORLD_MAINNET ? 'MAINNET' : 'LOCAL';
  }
  return want === 'TESTNET' ? 'TESTNET' : 'LOCAL';
}

/** True only when a real chain is both configured AND deliberately enabled. */
export function chainLive(which) {
  const f = economyFlags();
  const on = which === 'WORLD' ? f.WORLD_REAL_CHAIN : f.HITK_REAL_CHAIN;
  return !!on && economyNetwork() !== 'LOCAL';
}

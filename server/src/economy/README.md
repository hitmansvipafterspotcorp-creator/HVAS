# The economy layers

What is built, what is deliberately not, and what is waiting on something
outside this repo. Kept here so the next person — or the next session — does
not re-litigate a decision that has already been made.

## In, and covered by tests

| Module | What it enforces |
|---|---|
| `money.mjs` | Three money layers that refuse to add across each other (§3). Integer units only. |
| `hitk-price.mjs` | Throws when no rate has been adopted. There is no 1 HITK = $1 (§10). |
| `payments.mjs` | One payment service (§5). A member can never verify their own money. |
| `receipts.mjs` | Receipts, settlement as a new record, and the append-only ProofVault (§45). |
| `policy.mjs` | Versioned policy that must be adopted by a named person (§34, §36, §47). |
| `world-reserve.mjs` | Nine vaults that do not leak into each other (§30). Refusals are records. |
| `world-eligibility.mjs` | The restricted money firewall (§28). Unknown is refused, same as restricted. |
| `jubilee.mjs` | The §68 gate: classify, verify, check capacity, approve, pick a provider. |
| `accounts.mjs` | Economic identity, with ids derived so idempotency is structural. |
| `flags.mjs` | §63's flags. All four chain flags default off; MAINNET needs two switches (§64). |

Required tests from the directive live in `../../economy-test.mjs`: §65 (HITK),
§66 (fiat), §67 (WORLD), §68 (Jubilee).

## In, but dormant until configured

`../hitkoin.mjs` mints a real ERC-20 on a confirmed payment — custodial, key
sealed at rest, fails soft so a chain error never blocks a membership. It stays
dark until `HITKOIN_CONTRACT_ADDRESS`, `HITKOIN_RPC_URL` and
`HITKOIN_MINTER_PRIVATE_KEY` are all set, and there is no contract deployed, so
nothing mints today. `/wallet` reports `enabled: false` rather than pretending.

## Not built, on purpose

**KORTEX (§43) — declined by the owner. Do not build it, and do not raise it
again as a gap.** It was flagged twice as missing before that call was made;
this line is here so it is not flagged a third time.

## Not built, still open

- **§57–62, the Solidity modules.** The gate is in — `flags.mjs` cites §57 and
  §61 as the reason the chain flags are off — but no contract has been written,
  compiled, tested or audited. The order is compile → test → audit → testnet,
  and an audit is not something this repo can perform on itself.
- **§52, the public dashboard.** §51's rule (safe aggregates only, never expose
  a private figure) is honoured everywhere data leaves the house side, but there
  is no public page yet.
- **§69, the 2030 failure drill.**

## The rule the whole directory answers to

§63 ends with *do not fake mainnet functionality*. A flag that says a chain is
connected when it is not is worse than no flag, and a balance that looks like
money nobody can spend is worse than an empty screen that says so.

# HitKoin — dev, test, deploy

HitKoin is HVAS's member reward token — a loyalty currency, not an
investment. It mints to a member's wallet the moment they pay for anything
(membership, bingo, perks), redeemable for real venue perks (free entry, VIP
upgrades, drink perks). It's the Dave & Buster's Power Card idea, on a real
chain: provably the member's, not just a number in a database.

This folder is separate from the zero-dependency `server/` runtime on
purpose — Hardhat + OpenZeppelin are dev-time tooling to compile/test/deploy
the contract, not something that needs to ship in the running backend.

## 1. Install

```bash
cd server/blockchain
npm install
```

## 2. Test

```bash
npm test
```

Runs on Hardhat's own local, in-process test chain — no real money, no
internet-facing RPC involved.

## 3. Deploy

Pick a chain. **Polygon** is the default here because gas costs fractions of
a cent — minting HitKoin to a member costs essentially nothing per
transaction, unlike Ethereum mainnet where it'd be real dollars per mint.

You need:
- An **RPC endpoint** (a free tier from Alchemy, Infura, or QuickNode works)
- A **deployer wallet** with a small amount of MATIC for gas (buy ~$5 worth,
  or grab free testnet MATIC from a faucet for the practice run below)
- A separate **minter wallet** — this is the address the backend signs mint
  transactions from going forward. Can be the same wallet as the deployer,
  or a different one you rotate to later via `setMinter()`.

```bash
# practice run first — free testnet tokens, zero real cost
export HITKOIN_DEPLOYER_PRIVATE_KEY=0x...        # deployer wallet's key
export HITKOIN_MINTER_ADDRESS=0x...              # minter wallet's address
export POLYGON_AMOY_RPC_URL=https://...          # your RPC endpoint
npm run deploy:testnet

# once you're confident — real Polygon, costs real (tiny) gas
export POLYGON_RPC_URL=https://...
npm run deploy:mainnet
```

The deploy script prints the contract address it just created. Add that,
the RPC URL, and the **minter wallet's** private key to the backend's
environment (see `server/.env.example`):

```bash
HITKOIN_CONTRACT_ADDRESS=0x...   # from the deploy output above
HITKOIN_RPC_URL=https://...      # same RPC endpoint
HITKOIN_MINTER_PRIVATE_KEY=0x... # the MINTER wallet's key, not the deployer's
```

Restart the backend — HitKoin starts minting on the next confirmed payment.
No HitKoin env vars set at all = the feature just stays off; every payment
flow works exactly the same either way.

## Contract

`contracts/HitKoin.sol` — a standard OpenZeppelin ERC-20 (`HitKoin` / `HITK`,
18 decimals) with one addition: only the current `minter` address can call
`mint()`/`mintBatch()`. The contract owner can rotate the minter via
`setMinter()` without redeploying — useful if you ever need to change which
wallet the backend signs from.

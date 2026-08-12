// Deploys HitKoin and sets the venue backend's wallet as the minter.
// Run with: npm run deploy:testnet   (Polygon Amoy — free test tokens, practice run)
//       or: npm run deploy:mainnet   (real Polygon — costs a small amount of real MATIC for gas)
const hre = require("hardhat");

async function main() {
  const minterAddress = process.env.HITKOIN_MINTER_ADDRESS;
  if (!minterAddress) {
    throw new Error(
      "Set HITKOIN_MINTER_ADDRESS to the venue backend's wallet address before deploying " +
      "(that's the wallet whose private key the backend holds to auto-mint on payment)."
    );
  }

  const HitKoin = await hre.ethers.getContractFactory("HitKoin");
  const token = await HitKoin.deploy(minterAddress);
  await token.waitForDeployment();

  const address = await token.getAddress();
  console.log("\nHitKoin deployed:", address);
  console.log("Minter set to:", minterAddress);
  console.log("\nAdd this to the backend's environment:");
  console.log(`HITKOIN_CONTRACT_ADDRESS=${address}`);
}

main().catch((err) => { console.error(err); process.exitCode = 1; });

require("@nomicfoundation/hardhat-toolbox");

// Deploy keys/RPC URLs live in the environment, never in this file or git.
// Same pattern as the rest of HVAS (staff codes, PayPal secret, etc.).
const DEPLOYER_KEY = process.env.HITKOIN_DEPLOYER_PRIVATE_KEY || "";
const POLYGON_RPC = process.env.POLYGON_RPC_URL || "https://polygon-rpc.com";
const AMOY_RPC = process.env.POLYGON_AMOY_RPC_URL || "https://rpc-amoy.polygon.technology";

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    hardhat: {}, // local, in-process, no network needed — this is what `npm test` runs against
    polygon: {
      url: POLYGON_RPC,
      accounts: DEPLOYER_KEY ? [DEPLOYER_KEY] : [],
      chainId: 137,
    },
    polygonAmoy: {
      url: AMOY_RPC,
      accounts: DEPLOYER_KEY ? [DEPLOYER_KEY] : [],
      chainId: 80002,
    },
  },
};

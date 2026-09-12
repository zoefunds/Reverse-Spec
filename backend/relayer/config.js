import "dotenv/config";

/** Central, validated configuration for the relayer. Fails loudly on
 * missing critical vars rather than silently no-op'ing a poll loop. */
export const config = {
  genlayerNetwork: process.env.GENLAYER_NETWORK ?? "studionet",
  genlayerContractAddress: process.env.GENLAYER_CONTRACT_ADDRESS ?? "",
  pollIntervalMs: parseInt(process.env.RELAYER_POLL_INTERVAL_MS ?? "30000", 10),
  logLevel: process.env.LOG_LEVEL ?? "info",
  stateFile: process.env.RELAYER_STATE_FILE ?? "./relayer-state.json",
  baseSepolia: {
    rpcUrl: process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org",
    usdcAddress:
      process.env.BASE_SEPOLIA_USDC_ADDRESS ??
      "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    escrowAddress: process.env.REVERSE_SPEC_ESCROW_ADDRESS ?? "",
    // Same key signs both halves of the relay: it is the escrow's trusted
    // `relayer` (settle()) and, via createAccount(), the GenLayer
    // contract's trusted `relayer` (record_funding()/mark_settled()) — one
    // operational identity that only ever acts on deposits/outcomes it has
    // independently confirmed on-chain.
    relayerPrivateKey: process.env.BASE_SEPOLIA_RELAYER_PRIVATE_KEY ?? "",
    // Blocks to wait behind the chain head before treating a `Funded`
    // deposit as final.
    confirmations: parseInt(
      process.env.BASE_SEPOLIA_STAKE_CONFIRMATIONS ?? "5",
      10,
    ),
  },
};

export function assertConfig() {
  const problems = [];
  if (!config.genlayerContractAddress) {
    problems.push("GENLAYER_CONTRACT_ADDRESS is required");
  }
  if (!config.baseSepolia.escrowAddress) {
    problems.push("REVERSE_SPEC_ESCROW_ADDRESS is required");
  }
  if (!config.baseSepolia.relayerPrivateKey) {
    problems.push("BASE_SEPOLIA_RELAYER_PRIVATE_KEY is required");
  }
  if (problems.length) {
    throw new Error(`Relayer misconfigured: ${problems.join("; ")}`);
  }
}

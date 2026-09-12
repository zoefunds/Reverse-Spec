import { config, assertConfig } from "./config.js";
import { startFundingRelay, fundingRelayState } from "./fundingRelay.js";
import { startPayoutRelay, payoutRelayState } from "./payoutRelay.js";

const logger = {
  info: (msg) => console.log(`[${new Date().toISOString()}] INFO  ${msg}`),
  warn: (msg) => console.warn(`[${new Date().toISOString()}] WARN  ${msg}`),
  error: (msg) => console.error(`[${new Date().toISOString()}] ERROR ${msg}`),
};

assertConfig();
logger.info(
  `starting reverse-spec relayer: genlayer=${config.genlayerContractAddress} ` +
    `escrow=${config.baseSepolia.escrowAddress} network=${config.genlayerNetwork}`,
);

startFundingRelay(logger);
startPayoutRelay(logger);

process.on("SIGINT", () => {
  logger.info(
    `shutting down. funding: ${JSON.stringify(fundingRelayState)} ` +
      `payout: ${JSON.stringify(payoutRelayState)}`,
  );
  process.exit(0);
});

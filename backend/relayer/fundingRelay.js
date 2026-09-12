/** Funding relay: turns a confirmed Base Sepolia USDC deposit into a
 * GenLayer bounty opening. This is the only path that ever calls
 * `record_funding` on the GenLayer contract (see
 * contracts/reverse_spec_bounties.py), and `record_funding` in turn is the
 * only thing that ever opens a bounty to submissions.
 *
 * Every deposit is independently observed on-chain (a confirmed `Funded`
 * event) before being relayed — nothing here trusts a client-supplied
 * amount. `record_funding` is idempotent on `base_tx_hash`, so a retried
 * relay (crash, RPC hiccup) can never double-credit a bounty; that
 * idempotency lives on GenLayer, not in this process's memory, so this
 * relay is safe to restart at any point.
 */
import { Contract, JsonRpcProvider } from "ethers";
import { config } from "./config.js";
import { readContract, writeAndWait } from "./genlayer.js";
import { getSyncState, setSyncState } from "./state.js";

const ESCROW_ABI = [
  "event Funded(uint256 indexed bountyId, address indexed funder, uint256 amount)",
];
const LAST_BLOCK_KEY = "fundingRelay:lastScannedBlock";
const MAX_BLOCK_RANGE = 2000; // stay well under typical RPC log-range caps

export const fundingRelayState = {
  lastTickAt: null,
  lastError: null,
  deposits: 0,
  applied: 0,
};

function provider() {
  return new JsonRpcProvider(config.baseSepolia.rpcUrl);
}

async function scanAndApply(logger) {
  const p = provider();
  const escrow = new Contract(config.baseSepolia.escrowAddress, ESCROW_ABI, p);
  const head = await p.getBlockNumber();
  const safeHead = head - config.baseSepolia.confirmations;
  if (safeHead < 0) return;

  const stored = getSyncState(LAST_BLOCK_KEY);
  const fromBlock = stored != null ? Number(stored) + 1 : Math.max(0, safeHead - MAX_BLOCK_RANGE);
  if (fromBlock > safeHead) return;
  const toBlock = Math.min(safeHead, fromBlock + MAX_BLOCK_RANGE);

  const events = await escrow.queryFilter(escrow.filters.Funded(), fromBlock, toBlock);
  for (const ev of events) {
    const baseTxHash = ev.transactionHash.toLowerCase();
    const bountyId = Number(ev.args.bountyId);
    const funder = ev.args.funder;
    const amount = ev.args.amount.toString();
    fundingRelayState.deposits += 1;
    try {
      await writeAndWait(logger, "record_funding", [bountyId, funder, amount, baseTxHash]);
      fundingRelayState.applied += 1;
      logger.info(`funding relayed: bounty=${bountyId} amount=${amount} tx=${baseTxHash}`);
    } catch (err) {
      // Left un-recorded on GenLayer; retried the next time a full re-scan
      // (or a manual replay) covers this block range. record_funding's own
      // idempotency on base_tx_hash makes replay safe.
      fundingRelayState.lastError = err.message;
      logger.error(`funding relay failed for tx=${baseTxHash}: ${err.message}`);
    }
  }
  setSyncState(LAST_BLOCK_KEY, String(toBlock));
}

export function startFundingRelay(logger) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await scanAndApply(logger);
      fundingRelayState.lastError = null;
    } catch (err) {
      fundingRelayState.lastError = err.message;
      logger.error(`funding relay tick failed: ${err.message}`);
    } finally {
      fundingRelayState.lastTickAt = new Date().toISOString();
      running = false;
    }
  };
  tick();
  setInterval(tick, Math.max(config.pollIntervalMs, 15000));
}

// Re-exported for readContract-based reconciliation callers, if ever needed.
export { readContract };

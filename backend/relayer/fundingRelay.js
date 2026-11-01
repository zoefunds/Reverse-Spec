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
import { Contract, JsonRpcProvider, Wallet } from "ethers";
import { config } from "./config.js";
import { readContract, writeAndWait } from "./genlayer.js";
import { getSyncState, updateSyncState } from "./state.js";

const ESCROW_ABI = [
  "event Funded(uint256 indexed bountyId, address indexed funder, uint256 amount, uint256 indexed depositId)",
  "function acknowledgeDeposit(uint256 depositId)",
  "function deposits(uint256) view returns (uint256 bountyId, address funder, uint256 amount, uint64 refundableAt, bool acknowledged, bool refunded)",
];
const LAST_BLOCK_KEY = "fundingRelay:lastScannedBlock";
const PENDING_KEY = "fundingRelay:pendingDeposits";
const MAX_BLOCK_RANGE = 2000; // stay well under typical RPC log-range caps

export const fundingRelayState = {
  lastTickAt: null,
  lastError: null,
  deposits: 0,
  applied: 0,
  pending: 0,
};

function provider() {
  return new JsonRpcProvider(config.baseSepolia.rpcUrl);
}

export async function scanAndApply(logger, deps = {}) {
  const p = provider();
  const escrow = deps.escrow ?? new Contract(
    config.baseSepolia.escrowAddress,
    ESCROW_ABI,
    new Wallet(config.baseSepolia.relayerPrivateKey, p),
  );
  const applyFunding = deps.writeAndWait ?? writeAndWait;
  const getState = deps.getSyncState ?? getSyncState;
  const updateState = deps.updateSyncState ?? updateSyncState;
  const head = deps.head ?? await p.getBlockNumber();
  const safeHead = head - config.baseSepolia.confirmations;
  if (safeHead < 0) return { scanned: false, pending: 0, allAcknowledged: true };

  const stored = getState(LAST_BLOCK_KEY);
  const fromBlock = stored != null
    ? Number(stored) + 1
    : Math.max(0, config.baseSepolia.fundingStartBlock);
  let toBlock = Number(stored ?? (fromBlock - 1));
  if (fromBlock <= safeHead) {
    toBlock = Math.min(safeHead, fromBlock + MAX_BLOCK_RANGE);
    const events = deps.queryEvents
      ? await deps.queryEvents(fromBlock, toBlock)
      : (deps.events ?? await escrow.queryFilter(
          escrow.filters.Funded(), fromBlock, toBlock,
        ));
    // Persist newly discovered work and its scan cursor in one atomic file
    // replacement. A crash can yield duplicates, never a skipped deposit.
    updateState((all) => {
      const pending = all[PENDING_KEY] ?? {};
      for (const ev of events) {
        const baseTxHash = ev.transactionHash.toLowerCase();
        const eventIndex = Number(ev.index ?? ev.logIndex ?? 0);
        const key = `${baseTxHash}:${eventIndex}`;
        pending[key] ??= {
          baseTxHash,
          bountyId: Number(ev.args.bountyId),
          funder: ev.args.funder,
          amount: ev.args.amount.toString(),
          depositId: ev.args.depositId.toString(),
          blockNumber: Number(ev.blockNumber ?? 0),
          attempts: 0,
          lastError: null,
        };
      }
      all[PENDING_KEY] = pending;
      all[LAST_BLOCK_KEY] = String(toBlock);
    });
  }

  const pending = { ...(getState(PENDING_KEY) ?? {}) };
  for (const [key, deposit] of Object.entries(pending)) {
    const { baseTxHash, bountyId, funder, amount, depositId } = deposit;
    fundingRelayState.deposits += 1;
    try {
      if (typeof escrow.deposits === "function") {
        const onchain = await escrow.deposits(depositId);
        if (onchain.acknowledged ?? onchain[4]) {
          delete pending[key];
          logger.info(`funding already acknowledged on Base: deposit=${depositId}`);
          continue;
        }
        if (onchain.refunded ?? onchain[5]) {
          delete pending[key];
          logger.warn(`dropping refunded unacknowledged deposit=${depositId}`);
          continue;
        }
      }
      await applyFunding(logger, "record_funding", [bountyId, funder, amount, baseTxHash]);
      const ackTx = await escrow.acknowledgeDeposit(depositId);
      await ackTx.wait();
      fundingRelayState.applied += 1;
      delete pending[key];
      logger.info(`funding relayed: bounty=${bountyId} amount=${amount} tx=${baseTxHash}`);
    } catch (err) {
      fundingRelayState.lastError = err.message;
      deposit.attempts = Number(deposit.attempts ?? 0) + 1;
      deposit.lastError = err.message;
      deposit.lastAttemptAt = new Date().toISOString();
      logger.error(`funding relay failed for tx=${baseTxHash}: ${err.message}`);
    }
  }
  updateState((all) => { all[PENDING_KEY] = pending; });
  fundingRelayState.pending = Object.keys(pending).length;
  return {
    fromBlock,
    toBlock,
    scanned: fromBlock <= safeHead,
    pending: fundingRelayState.pending,
    allAcknowledged: fundingRelayState.pending === 0,
  };
}

export function startFundingRelay(logger) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const result = await scanAndApply(logger);
      if (result?.allAcknowledged) fundingRelayState.lastError = null;
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

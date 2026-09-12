/** Payout relay: turns a GenLayer consensus outcome into a real USDC
 * settlement on Base Sepolia. This is the only path that ever calls
 * `settle()` on ReverseSpecEscrow.sol.
 *
 * GenLayer never moves value — `get_base_payouts(bountyId)` is a pure view
 * that only returns non-empty once a bounty has reached a terminal state
 * (RESOLVED / UNRESOLVED-then-RECLAIMED / CANCELLED) AND has an unsettled
 * ledger balance. This relay reads that view, submits `settle()` with the
 * exact recipients/amounts GenLayer computed, then calls `mark_settled` so
 * the view stops re-offering an already-settled bounty. Both `settle()`
 * (one-shot per bountyId on-chain) and `mark_settled` (idempotent on
 * base_tx_hash) make a retried relay safe.
 */
import { Contract, JsonRpcProvider, Wallet } from "ethers";
import { config } from "./config.js";
import { readContract, writeAndWait } from "./genlayer.js";

const ESCROW_ABI = [
  "function settle(uint256 bountyId, address[] recipients, uint256[] amounts) external",
  "function pools(uint256) view returns (uint256 deposited, uint256 allocated, bool settled)",
];

export const payoutRelayState = {
  lastTickAt: null,
  lastError: null,
  settled: 0,
};

function escrowWithSigner() {
  const provider = new JsonRpcProvider(config.baseSepolia.rpcUrl);
  const wallet = new Wallet(config.baseSepolia.relayerPrivateKey, provider);
  return new Contract(config.baseSepolia.escrowAddress, ESCROW_ABI, wallet);
}

async function relayBounty(logger, bountyId, escrow) {
  const payouts = await readContract("get_base_payouts", [bountyId]);
  if (!payouts || payouts.length === 0) return; // nothing unsettled

  const pool = await escrow.pools(bountyId);
  if (pool.settled) {
    // Already settled on Base but GenLayer hasn't been told yet — close
    // the loop without re-submitting settle().
    logger.warn(`bounty ${bountyId} already settled on Base; reconciling mark_settled`);
    await writeAndWait(logger, "mark_settled", [bountyId, "reconciled"]);
    return;
  }

  const recipients = payouts.map((p) => p.recipient);
  const amounts = payouts.map((p) => BigInt(p.amount));
  const total = amounts.reduce((a, b) => a + b, 0n);
  if (total > pool.deposited) {
    // Sanity check: never submit a settlement the escrow can't cover.
    // This should be structurally impossible (GenLayer never allocates
    // more than record_funding confirmed was deposited), so treat it as
    // a hard stop rather than a silent skip.
    throw new Error(
      `bounty ${bountyId}: payout total ${total} exceeds deposited ${pool.deposited}`,
    );
  }

  const tx = await escrow.settle(bountyId, recipients, amounts);
  const receipt = await tx.wait();
  await writeAndWait(logger, "mark_settled", [bountyId, receipt.hash.toLowerCase()]);
  payoutRelayState.settled += 1;
  logger.info(`bounty ${bountyId} settled on Base Sepolia: tx=${receipt.hash}`);
}

async function scanAndSettle(logger) {
  const escrow = escrowWithSigner();
  // Terminal statuses whose payout instructions may need relaying.
  const statuses = ["RESOLVED", "UNRESOLVED", "CANCELLED", "RECLAIMED"];
  const stats = await readContract("get_platform_stats", []);
  const total = Number(stats.bounties_total ?? 0);
  for (let bountyId = 1; bountyId <= total; bountyId++) {
    let bounty;
    try {
      bounty = await readContract("get_bounty", [bountyId]);
    } catch {
      continue;
    }
    if (!statuses.includes(bounty.status)) continue;
    try {
      await relayBounty(logger, bountyId, escrow);
    } catch (err) {
      payoutRelayState.lastError = `bounty ${bountyId}: ${err.message}`;
      logger.error(`payout relay failed for bounty ${bountyId}: ${err.message}`);
    }
  }
}

export function startPayoutRelay(logger) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await scanAndSettle(logger);
      payoutRelayState.lastError = null;
    } catch (err) {
      payoutRelayState.lastError = err.message;
      logger.error(`payout relay tick failed: ${err.message}`);
    } finally {
      payoutRelayState.lastTickAt = new Date().toISOString();
      running = false;
    }
  };
  tick();
  setInterval(tick, Math.max(config.pollIntervalMs, 30000));
}

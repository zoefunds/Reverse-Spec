/** Recover Base-side evidence for a completed payment-path run.
 * Public Base RPCs cap eth_getLogs ranges, so all queries are chunked.
 */
import { Contract, JsonRpcProvider } from "ethers";
import { config } from "./config.js";

const bountyId = BigInt(process.env.E2E_EVIDENCE_BOUNTY_ID ?? "0");
if (!bountyId) throw new Error("E2E_EVIDENCE_BOUNTY_ID is required");
const fromBlock = Number(
  process.env.E2E_EVIDENCE_FROM_BLOCK ?? config.baseSepolia.fundingStartBlock,
);
const provider = new JsonRpcProvider(config.baseSepolia.rpcUrl);
const escrow = new Contract(config.baseSepolia.escrowAddress, [
  "event Funded(uint256 indexed bountyId,address indexed funder,uint256 amount,uint256 indexed depositId)",
  "event Settled(uint256 indexed bountyId,uint256 recipientCount,uint256 allocated)",
  "event Claimed(uint256 indexed bountyId,address indexed recipient,uint256 amount)",
], provider);

async function queryInChunks(filter) {
  const latest = await provider.getBlockNumber();
  const logs = [];
  for (let start = fromBlock; start <= latest; start += 199) {
    const end = Math.min(start + 198, latest);
    logs.push(...await escrow.queryFilter(filter, start, end));
  }
  return logs.map((log) => ({
    transactionHash: log.transactionHash,
    blockNumber: log.blockNumber,
    args: log.args.toArray().map(String),
  }));
}

console.log(JSON.stringify({
  bountyId: bountyId.toString(),
  funded: await queryInChunks(escrow.filters.Funded(bountyId)),
  settled: await queryInChunks(escrow.filters.Settled(bountyId)),
  claimed: await queryInChunks(escrow.filters.Claimed(bountyId)),
}, null, 2));

import test from "node:test";
import assert from "node:assert/strict";

import { scanAndApply } from "./fundingRelay.js";
import { normalizePrivateKey } from "./config.js";

const logger = { info() {}, warn() {}, error() {} };

test("normalizes secret-manager private keys for both ethers and GenLayer", () => {
  assert.equal(normalizePrivateKey("ab"), "0xab");
  assert.equal(normalizePrivateKey("0xab"), "0xab");
});

test("durably queues and retries an interrupted GenLayer acknowledgement", async () => {
  const state = {};
  const event = {
    transactionHash: "0xABC",
    args: { bountyId: 7n, funder: "0x0000000000000000000000000000000000000007", amount: 25000000n, depositId: 3n },
  };
  let attempts = 0;
  let baseAcknowledgements = 0;
  const deps = {
    head: 100,
    events: [event],
    escrow: {
      async acknowledgeDeposit() {
        baseAcknowledgements += 1;
        return { async wait() {} };
      },
    },
    getSyncState: (key) => state[key] ?? null,
    updateSyncState: (mutator) => mutator(state),
    async writeAndWait() {
      attempts += 1;
      if (attempts === 1) throw new Error("simulated GenLayer interruption");
    },
  };

  const first = await scanAndApply(logger, deps);
  assert.equal(first.allAcknowledged, false);
  assert.equal(state["fundingRelay:lastScannedBlock"], "95");
  assert.equal(Object.keys(state["fundingRelay:pendingDeposits"]).length, 1,
    "cursor may advance only because failed work is durably queued");
  assert.equal(baseAcknowledgements, 0);

  // Simulates the next tick (or process restart): the scanned range is not
  // queried again, but its durable pending record is still retried.
  const second = await scanAndApply(logger, deps);
  assert.equal(second.allAcknowledged, true);
  assert.equal(state["fundingRelay:lastScannedBlock"], "95");
  assert.deepEqual(state["fundingRelay:pendingDeposits"], {});
  assert.equal(attempts, 2);
  assert.equal(baseAcknowledgements, 1);
});

test("a poison deposit does not prevent discovery and application of later ranges", async () => {
  const state = {};
  let head = 2105;
  const event = (hash, bountyId, depositId, blockNumber) => ({
    transactionHash: hash,
    index: 0,
    blockNumber,
    args: {
      bountyId: BigInt(bountyId),
      funder: `0x${String(bountyId).padStart(40, "0")}`,
      amount: 5000000n,
      depositId: BigInt(depositId),
    },
  });
  const acknowledged = [];
  const deps = {
    get head() { return head; },
    queryEvents: async (from) => from === 0
      ? [event("0x01", 7, 1, 100)]
      : [event("0x02", 8, 2, 2500)],
    escrow: {
      async acknowledgeDeposit(id) {
        acknowledged.push(String(id));
        return { async wait() {} };
      },
    },
    getSyncState: (key) => state[key] ?? null,
    updateSyncState: (mutator) => mutator(state),
    async writeAndWait(_logger, _method, args) {
      if (args[0] === 7) throw new Error("permanent invalid deposit");
    },
  };

  await scanAndApply(logger, deps);
  assert.equal(state["fundingRelay:lastScannedBlock"], "199");
  head = 4105;
  const second = await scanAndApply(logger, deps);
  assert.equal(state["fundingRelay:lastScannedBlock"], "399");
  assert.deepEqual(acknowledged, ["2"]);
  assert.equal(second.pending, 1, "only the poison deposit remains queued");
});

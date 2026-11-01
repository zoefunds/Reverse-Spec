import test from "node:test";
import assert from "node:assert/strict";

import { scanAndApply } from "./fundingRelay.js";
import { normalizePrivateKey } from "./config.js";
import { assertSuccessfulExecution, plain, writeAndWait } from "./genlayer.js";

const logger = { info() {}, warn() {}, error() {} };

test("normalizes secret-manager private keys for both ethers and GenLayer", () => {
  assert.equal(normalizePrivateKey("ab"), "0xab");
  assert.equal(normalizePrivateKey("0xab"), "0xab");
});

test("normalizes nested GenLayer map results for payout discovery", () => {
  const value = new Map([
    ["bounties_total", 1n],
    ["payouts", [new Map([["recipient", "0xabc"], ["amount", 5_000_000n]])]],
  ]);
  assert.deepEqual(plain(value), {
    bounties_total: 1,
    payouts: [{ recipient: "0xabc", amount: 5_000_000 }],
  });
});

test("finalized GenLayer transaction with failed execution is rejected", async () => {
  let hash = 0;
  const client = {
    async writeContract() { hash += 1; return `0x${hash}`; },
    async waitForTransactionReceipt() {
      return {
        statusName: "FINALIZED",
        consensus_data: { leader_receipt: [{
          mode: "leader",
          execution_result: "ERROR",
          genvm_result: { raw_error: { causes: ["UserError"] }, error_code: "USER_ERROR" },
          result: { status: "rollback" },
        }] },
      };
    },
  };
  await assert.rejects(
    writeAndWait(logger, "record_funding", [1], { client }),
    /finalized but contract execution failed/,
  );
});

test("non-final GenLayer transaction is rejected even with successful execution", () => {
  assert.throws(() => assertSuccessfulExecution({
    statusName: "ACCEPTED",
    consensus_data: { leader_receipt: [{
      mode: "leader", execution_result: "SUCCESS",
      genvm_result: { raw_error: null, error_code: null },
      result: { status: "return" },
    }] },
  }, "record_funding"), /did not reach FINALIZED/);
});

test("canonical finalized execution result is preferred when available", () => {
  assert.doesNotThrow(() => assertSuccessfulExecution({
    statusName: "FINALIZED",
    txExecutionResultName: "FINISHED_WITH_RETURN",
  }, "record_funding"));
  assert.throws(() => assertSuccessfulExecution({
    statusName: "FINALIZED",
    txExecutionResultName: "FINISHED_WITH_ERROR",
  }, "record_funding"), /contract execution failed/);
});

test("successful finalized StudioNet leader execution is accepted", () => {
  assert.doesNotThrow(() => assertSuccessfulExecution({
    status_name: "FINALIZED",
    consensus_data: { leader_receipt: [{
      mode: "leader", execution_result: "SUCCESS",
      genvm_result: { raw_error: null, error_code: null },
      result: { status: "return" },
    }] },
  }, "record_funding"));
});

test("finalized receipt without independent execution evidence is rejected", () => {
  assert.throws(() => assertSuccessfulExecution({
    statusName: "FINALIZED",
    consensus_data: { leader_receipt: [] },
  }, "record_funding"), /finalized without an execution result/);
});

test("failed GenLayer execution stays queued and never acknowledges Base", async () => {
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
      if (attempts === 1) {
        throw new Error("record_funding finalized but contract execution failed");
      }
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
  assert.equal(attempts, 3, "record retry and activation both execute successfully");
  assert.equal(baseAcknowledgements, 1);
});

test("seven-day Base refund cannot leave an active GenLayer bounty", async () => {
  const state = {};
  let refunded = false;
  let ackAttempts = 0;
  const writes = [];
  const event = {
    transactionHash: "0xF00D",
    args: {
      bountyId: 9n,
      funder: "0x0000000000000000000000000000000000000009",
      amount: 5000000n,
      depositId: 4n,
    },
  };
  const deps = {
    head: 100,
    events: [event],
    escrow: {
      async deposits() {
        return { acknowledged: false, refunded };
      },
      async acknowledgeDeposit() {
        ackAttempts += 1;
        throw new Error("Base relayer outage");
      },
    },
    getSyncState: (key) => state[key] ?? null,
    updateSyncState: (mutator) => mutator(state),
    async writeAndWait(_logger, method) {
      writes.push(method);
    },
  };

  const beforeRefund = await scanAndApply(logger, deps);
  assert.equal(beforeRefund.pending, 1);
  assert.deepEqual(writes, ["record_funding"]);
  assert.equal(ackAttempts, 1);
  assert.ok(!writes.includes("activate_funding"),
    "a recorded commitment is not an active bounty before Base acknowledgement");

  // Models refundUnacknowledged succeeding after REFUND_DELAY while the
  // relayer was unavailable. Reconciliation voids the non-active commitment.
  refunded = true;
  const afterRefund = await scanAndApply(logger, deps);
  assert.equal(afterRefund.pending, 0);
  assert.deepEqual(writes, ["record_funding", "void_funding"]);
  assert.ok(!writes.includes("activate_funding"));
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

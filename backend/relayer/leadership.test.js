import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";

import { runAsLeader } from "./leadership.js";

const logger = { info() {}, warn() {}, error() {} };

test("starts relay work only after acquiring the shared advisory lease", async () => {
  let started = 0;
  class LeaderClient extends EventEmitter {
    async connect() {}
    async query() { return { rows: [{ acquired: true }] }; }
    async end() {}
  }
  const client = await runAsLeader(logger, () => { started += 1; }, {
    databaseUrl: "postgres://test",
    Client: LeaderClient,
  });
  assert.equal(started, 1);
  assert.ok(client instanceof LeaderClient);
});

test("standby waits until the lease is available", async () => {
  let attempts = 0;
  let started = 0;
  class FailoverClient extends EventEmitter {
    async connect() {}
    async query() {
      attempts += 1;
      return { rows: [{ acquired: attempts >= 2 }] };
    }
    async end() {}
  }
  await runAsLeader(logger, () => { started += 1; }, {
    databaseUrl: "postgres://test",
    Client: FailoverClient,
    sleep: async () => {},
  });
  assert.equal(attempts, 2);
  assert.equal(started, 1);
});

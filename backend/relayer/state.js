import fs from "node:fs";
import { config } from "./config.js";

/** Tiny local JSON sync-state store: this relayer only needs to remember
 * where it last scanned Base Sepolia for `Funded` events. Correctness
 * against double-application does NOT depend on this file — both
 * GenLayer's `record_funding`/`mark_settled` and the escrow's `settle()`
 * are independently idempotent on-chain (by base_tx_hash / one-shot per
 * bounty). Losing this file just means a wider re-scan next boot, not a
 * double-credit. */
function readAll() {
  try {
    return JSON.parse(fs.readFileSync(config.stateFile, "utf8"));
  } catch {
    return {};
  }
}

export function getSyncState(key) {
  return readAll()[key] ?? null;
}

export function setSyncState(key, value) {
  const all = readAll();
  all[key] = value;
  fs.writeFileSync(config.stateFile, JSON.stringify(all, null, 2));
}

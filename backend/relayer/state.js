import fs from "node:fs";
import { config } from "./config.js";

/** Durable local state. Writes use same-directory atomic rename so a crash
 * cannot publish a cursor without the pending deposits discovered with it. */
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
  updateSyncState((all) => { all[key] = value; });
}

export function updateSyncState(mutator) {
  const all = readAll();
  mutator(all);
  const temporary = `${config.stateFile}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(all, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, config.stateFile);
  return all;
}

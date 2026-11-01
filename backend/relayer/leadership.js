import pg from "pg";
import { config } from "./config.js";

const { Client } = pg;
const LEASE_KEY = 821477310043;
const RETRY_MS = 15_000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Acquire a PostgreSQL session advisory lock before starting either relay.
 * The lock is released automatically if the process or connection dies. A
 * former leader exits on connection loss so it can never continue writing
 * after losing the lease. A separate Fly app can therefore remain hot as a
 * standby without creating duplicate Base transactions.
 */
export async function runAsLeader(logger, start, deps = {}) {
  const databaseUrl = deps.databaseUrl ?? config.databaseUrl;
  if (!databaseUrl) {
    logger.warn("DATABASE_URL is unset; starting without redundant leadership");
    start();
    return null;
  }

  const ClientClass = deps.Client ?? Client;
  const retryMs = deps.retryMs ?? RETRY_MS;
  while (true) {
    const client = new ClientClass({
      connectionString: databaseUrl,
      application_name: config.instanceName,
      keepAlive: true,
    });
    try {
      await client.connect();
      const result = await client.query(
        "SELECT pg_try_advisory_lock($1) AS acquired",
        [LEASE_KEY],
      );
      if (result.rows[0]?.acquired) {
        logger.info(`leadership acquired by ${config.instanceName}`);
        client.on?.("error", (error) => {
          logger.error(`leadership connection lost: ${error.message}`);
          (deps.exit ?? process.exit)(1);
        });
        start();
        return client;
      }
      logger.info(`standby ${config.instanceName}: leadership held elsewhere`);
    } catch (error) {
      logger.error(`leadership check failed: ${error.message}`);
    }
    try { await client.end(); } catch { /* connection never opened */ }
    await (deps.sleep ?? sleep)(retryMs);
  }
}

# Deployment

## Contract (GenLayer StudioNet)

Production contract: `0x185cE8fff49fe93f57635aB03FC19B9e5d3D04e6`.

This is the coordinated acknowledgment/recovery deployment. The constructor
set both `owner` and `relayer` to the deploying address; the Base escrow below
uses the same operational identity.

To (re)deploy: open [studio.genlayer.com](https://studio.genlayer.com),
paste `contracts/reverse_spec_bounties.py`, deploy with no constructor args
from the relayer wallet, then update `GENLAYER_CONTRACT_ADDRESS` in
`backend/fly.toml` + Fly env and `NEXT_PUBLIC_CONTRACT_ADDRESS` in Vercel
env. If the relayer address ever needs to change afterwards, call
`set_relayer(new_relayer)` as the GenLayer contract owner (and
`setRelayer(new_relayer)` on the Base escrow as its owner) instead of
redeploying.

## Deploying the Base Sepolia escrow

`contracts/base/ReverseSpecEscrow.sol` holds the real USDC and must be
deployed before the GenLayer contract goes live, since the GenLayer side
needs a `relayer` address that matches the escrow's `relayer`. It's
already deployed for this project at
`0x8e07D1aE543c489D64E368A579Ac28cF8b541256` on Base Sepolia (USDC token
`0x036CbD53842c5426634e7929541eC2318f3dCF7e`, relayer/owner
`0x7401c129EDfc26E68FE19309fE461eb3Db1058Eb`), deployed at Base block
`52994901`. Redeploy only if you need a fresh instance.

```bash
cd contracts/base
npm install   # solc + ethers, if not already present
BASE_SEPOLIA_RPC_URL="https://..." \
BASE_SEPOLIA_RELAYER_PRIVATE_KEY="0x..." \
BASE_SEPOLIA_USDC_ADDRESS="0x036CbD53842c5426634e7929541eC2318f3dCF7e" \
  node deploy.js
```

Required env vars:
- `BASE_SEPOLIA_RPC_URL` — Base Sepolia JSON-RPC endpoint
- `BASE_SEPOLIA_RELAYER_PRIVATE_KEY` — the deploying key; its address
  becomes the escrow's `owner` *and* `relayer`
- `BASE_SEPOLIA_USDC_ADDRESS` — USDC token address on Base Sepolia
  (defaults to the known testnet USDC if omitted)

The script compiles with the `solc` npm package (no Hardhat/Foundry
project), deploys with `ethers`, and writes the ABI to
`contracts/base/ReverseSpecEscrow.abi.json`.

Because the same relayer private key must sign both sides, the address
that comes out of this deploy becomes **both** the escrow's `relayer` on
Base Sepolia **and**, once you deploy `reverse_spec_bounties.py` from
that same key, the GenLayer contract's `owner`/`relayer` — the deployer
becomes both at GenLayer contract construction. Keep the two deploys using
the same key, or reconcile them afterwards with `set_relayer`/`setRelayer`
on each side.

After deploying, configure `backend/relayer/` (`fundingRelay.js` /
`payoutRelay.js`) with the escrow address, the GenLayer contract address,
and the relayer private key so it can bridge `Funded` events into
`record_funding` and `get_base_payouts` into `settle()`/`mark_settled`.

Set `BASE_SEPOLIA_FUNDING_START_BLOCK` to the escrow deployment block. With no
stored cursor the relayer replays from that block. Each scan atomically persists
new pending events with its cursor; pending acknowledgements retry independently
across restarts and cannot be skipped or stall discovery of later ranges.

## Real payment-path regression

With the relayer running, execute `npm run e2e:payment` in `backend/relayer`.
It performs a real Base Sepolia USDC approval/deposit, waits for automatic
funding acknowledgement, submits evidence, waits through the one-hour protocol
floor, runs consensus and finalization, waits for automatic Base settlement,
and makes the final USDC claim. It never directly calls `record_funding` or
`mark_settled`. Inject the two E2E keys and `E2E_EVIDENCE_URL` from a secret
manager.

The production run completed successfully for bounty `1`; its Base funding,
settlement, and claim transaction hashes are recorded in
[`../remediation-milestone.md`](../remediation-milestone.md).

## Backend — Fly.io (24/7)

```bash
cd backend
fly launch --no-deploy --copy-config --name reverse-spec-production-api
fly postgres create --name reverse-spec-production-db
fly postgres attach reverse-spec-production-db -a reverse-spec-production-api
# The app normalizes Fly's postgres:// DATABASE_URL to the psycopg driver.
fly secrets set JWT_SECRET="$(openssl rand -hex 32)"
fly secrets set CORS_ORIGINS="https://<your-vercel-domain>"
fly deploy -a reverse-spec-production-api
```

The 24/7 guarantees live in `fly.toml`:
- `auto_stop_machines = "off"` — never sleeps
- `min_machines_running = 1` — always at least one machine
- HTTP check on `/healthz` every 15s — Fly restarts unhealthy machines
- `release_command = "alembic upgrade head"` — migrations before rollout
- rolling deploy strategy — zero-downtime updates

Operations:
- Logs: `fly logs`
- Rollback: `fly releases` → `fly deploy --image <previous>`
- Scale out: `fly scale count 2` (recommended for redundancy)
- Backups: Fly Postgres daily snapshots (`fly postgres backup list`)

## Relayer — Fly.io (24/7)

The current app is `reverse-spec-production-relayer`. It runs one background
machine with the encrypted `relayer_state` volume mounted at `/data`; the
durable cursor and pending-deposit queue live at
`/data/relayer-state.json`.

```bash
cd backend/relayer
fly secrets set BASE_SEPOLIA_RELAYER_PRIVATE_KEY="0x..." \
  -a reverse-spec-production-relayer
fly deploy -a reverse-spec-production-relayer
```

The public Base RPC limits log queries to 200 blocks, so the relay scans
199-block windows and replays forward from `BASE_SEPOLIA_FUNDING_START_BLOCK`.
Never remove or replace the state volume without first preserving its contents
and confirming the deployment-block replay configuration.

## Frontend — Vercel

```bash
cd frontend
vercel link
vercel env add NEXT_PUBLIC_API_BASE production      # https://reverse-spec-production-api.fly.dev/api/v1
vercel env add NEXT_PUBLIC_CONTRACT_ADDRESS production
vercel env add NEXT_PUBLIC_ESCROW_ADDRESS production
vercel env add NEXT_PUBLIC_GENLAYER_NETWORK production   # studionet
vercel --prod
```

After the first deploy, set the final Vercel domain into the backend's
`CORS_ORIGINS` secret and `fly deploy` again.

## CI/CD

`.github/workflows/ci.yml` runs contract lint, contract tests, backend
tests, and the frontend build on every push. Deploys stay manual
(`fly deploy` / `vercel --prod`) so a human gates production.

## Monitoring

- `/healthz` — DB + indexer + contract address snapshot (Fly checks this)
- `/readyz` — DB-only readiness
- Indexer logs an ERROR if the on-chain escrow invariant ever reports
  unhealthy — alert on that string in `fly logs`. Since v1, the GenLayer
  contract holds no funds, so `check_escrow_invariant` checks internal
  ledger self-consistency (`tracked_open_escrow == summed_bounty_escrow`)
  rather than a real balance; also monitor `backend/relayer/` liveness,
  since a stalled relayer stalls both funding confirmations and payouts.

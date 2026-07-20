# Deployment

## Contract (GenLayer StudioNet) — already deployed

Deployed via GenLayer Studio by the project owner:
`0x1DD671F0b8Be9e6fB7e7F2078261e1B840AF4439`

To redeploy (e.g. after changes): open [studio.genlayer.com](https://studio.genlayer.com),
paste `contracts/reverse_spec_bounties.py`, deploy with no constructor args,
then update `GENLAYER_CONTRACT_ADDRESS` in `backend/fly.toml` + Fly env and
`NEXT_PUBLIC_CONTRACT_ADDRESS` in Vercel env.

## Backend — Fly.io (24/7)

```bash
cd backend
fly launch --no-deploy --copy-config --name reverse-spec-api   # first time
fly postgres create --name reverse-spec-db                     # managed PG
fly postgres attach reverse-spec-db                            # sets DATABASE_URL
# convert DATABASE_URL to the SQLAlchemy driver form:
fly secrets set DATABASE_URL="postgresql+psycopg://<user>:<pass>@<host>/<db>"
fly secrets set JWT_SECRET="$(openssl rand -hex 32)"
fly secrets set CORS_ORIGINS="https://<your-vercel-domain>"
fly deploy
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

## Frontend — Vercel

```bash
cd frontend
vercel link
vercel env add NEXT_PUBLIC_API_BASE production      # https://reverse-spec-api.fly.dev/api/v1
vercel env add NEXT_PUBLIC_CONTRACT_ADDRESS production
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
  unhealthy — alert on that string in `fly logs`.

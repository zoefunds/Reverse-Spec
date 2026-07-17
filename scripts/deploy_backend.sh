#!/usr/bin/env bash
# Deploy the backend to Fly.io (24/7 config lives in backend/fly.toml).
set -euo pipefail
cd "$(dirname "$0")/../backend"

echo "==> Verifying tests before deploy"
../.venv/bin/pytest tests/ -q

echo "==> Deploying to Fly.io"
fly deploy

echo "==> Post-deploy health check"
sleep 5
curl -fsS "https://$(fly status --json | python3 -c 'import json,sys; print(json.load(sys.stdin)["Hostname"])')/healthz"
echo
echo "Deployed OK."

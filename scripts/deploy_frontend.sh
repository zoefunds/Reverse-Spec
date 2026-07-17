#!/usr/bin/env bash
# Deploy the frontend to Vercel production.
set -euo pipefail
cd "$(dirname "$0")/../frontend"

echo "==> Verifying build before deploy"
npm run build

echo "==> Deploying to Vercel"
vercel --prod

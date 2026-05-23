#!/usr/bin/env bash
# Run locally or in CI before tagging a release / deploying.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> eslint"
npm run lint

echo "==> vitest"
npm test

echo "==> next build"
npm run build

echo "OK — pre-deploy checks passed."

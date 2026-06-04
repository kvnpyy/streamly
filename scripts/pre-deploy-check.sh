#!/usr/bin/env bash
# Run locally or in CI before tagging a release / deploying.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ "${SKIP_VERSION_BUMP:-}" != "1" ]; then
  echo "==> semver bump (conventional commits since last v* tag)"
  node scripts/bump-version.mjs
fi

echo "==> eslint"
npm run lint

echo "==> vitest"
npm test

echo "==> next build (webpack — stable RSC client manifest on VPS)"
npm run build

echo "OK — pre-deploy checks passed."

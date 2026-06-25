#!/usr/bin/env bash
# Run locally or in CI before tagging a release / deploying.
set -euo pipefail
cd "$(dirname "$0")/.."

# Ship what you committed — never deploy a dirty tree (missing files stay local).
if [ -n "$(git status --porcelain)" ] && [ "${STREAM_DEPLOY_ALLOW_DIRTY:-}" != "1" ]; then
  echo "Deploy blocked: uncommitted changes in the working tree." >&2
  git status --short >&2
  echo "Commit (or stash) everything first. Override: STREAM_DEPLOY_ALLOW_DIRTY=1" >&2
  exit 1
fi

# Warn when local branches still have commits not reachable from HEAD (common cause of
# “users report missing features” after a green-light deploy).
if [ "${STREAM_DEPLOY_SKIP_UNMERGED_CHECK:-}" != "1" ]; then
  head_ref="$(git rev-parse HEAD)"
  unmerged=()
  while IFS= read -r branch; do
    [ -z "$branch" ] && continue
    tip="$(git rev-parse "$branch" 2>/dev/null)" || continue
    if git merge-base --is-ancestor "$head_ref" "$tip" 2>/dev/null; then
      if ! git merge-base --is-ancestor "$tip" "$head_ref" 2>/dev/null; then
        unmerged+=("$branch")
      fi
    fi
  done < <(git for-each-ref --format='%(refname:short)' refs/heads/)
  if [ "${#unmerged[@]}" -gt 0 ]; then
    echo "Deploy blocked: local branches have commits not in HEAD:" >&2
    printf '  %s\n' "${unmerged[@]}" >&2
    echo "Merge them into $(git rev-parse --abbrev-ref HEAD) before deploy." >&2
    echo "Override: STREAM_DEPLOY_SKIP_UNMERGED_CHECK=1" >&2
    exit 1
  fi
fi

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

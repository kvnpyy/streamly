#!/usr/bin/env bash
# Copy the SQLite DB used by Streamly (from DATABASE_URL or default ./data/stream.db).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

RAW="${DATABASE_URL:-file:./data/stream.db}"
FILE="${RAW#file:}"
if [[ "$FILE" != /* ]]; then
  FILE="$ROOT/$FILE"
fi

if [[ ! -f "$FILE" ]]; then
  echo "Database file not found: $FILE" >&2
  exit 1
fi

STAMP=$(date +%Y%m%d-%H%M%S)
DEST="${FILE}.bak.${STAMP}"
cp "$FILE" "$DEST"
echo "Backed up to $DEST"

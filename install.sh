#!/usr/bin/env bash
# Installs the dsh-web-search-brightdata plugin into the DSH web profile.
# Usage: ./install.sh [profile]   (default profile: web)
set -euo pipefail

PROFILE="${1:-web}"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DST_DIR="$HOME/.dsh/profiles/node_modules/dsh-web-search-brightdata"
PATCH_FILE="$HOME/.dsh/profiles/$PROFILE/cordis.patch.yml"

if [ ! -f "$SRC/lib/index.js" ]; then
  echo "Plugin source not found at $SRC" >&2
  exit 1
fi

# 1. copy the package into the profile module fallback
rm -rf "$DST_DIR"
mkdir -p "$DST_DIR/lib"
cp "$SRC/package.json" "$DST_DIR/package.json"
cp "$SRC/lib/index.js" "$DST_DIR/lib/index.js"
cp "$SRC/lib/client.js" "$DST_DIR/lib/client.js"
cp "$SRC/lib/typert.host.js" "$DST_DIR/lib/typert.host.js"
echo "Installed plugin => $DST_DIR"

# 2. register the provider row in the profile patch layer (idempotent)
REG_BLOCK='# dsh-web-search-brightdata: Bright Data SERP (google) search provider (multi-key rotation) for ctx.web.
- insert:
    - id: web-search-brightdata
      name: '"'"'dsh-web-search-brightdata'"'"''

mkdir -p "$HOME/.dsh/profiles/$PROFILE"
touch "$PATCH_FILE"
if grep -q "dsh-web-search-brightdata" "$PATCH_FILE"; then
  echo "Plugin already registered in $PATCH_FILE"
else
  printf '%s\n\n' "$REG_BLOCK" >> "$PATCH_FILE"
  echo "Registered plugin in $PATCH_FILE"
fi

echo "Done. Restart the DSH web app; the strategy chain can then use the brightdata backend."

#!/usr/bin/env bash
# Render all Mermaid source files (.mmd) to SVG.
# Usage: ./scripts/render-diagrams.sh
#
# Requires: npx mmdc (mermaid-cli)
# Config:   docs/diagrams/mermaid.json

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DIAGRAMS_DIR="$PROJECT_ROOT/docs/diagrams"
CONFIG="$DIAGRAMS_DIR/mermaid.json"

if ! command -v npx &>/dev/null; then
  echo "Error: npx not found" >&2
  exit 1
fi

count=0
errors=0

for mmd in "$DIAGRAMS_DIR"/*.mmd; do
  [ -f "$mmd" ] || continue
  svg="${mmd%.mmd}.svg"
  name="$(basename "$mmd")"

  if npx mmdc -q -i "$mmd" -o "$svg" -b transparent -c "$CONFIG" 2>/dev/null; then
    printf "  %-45s -> %s\n" "$name" "$(basename "$svg")"
    count=$((count + 1))
  else
    printf "  FAILED: %s\n" "$name" >&2
    errors=$((errors + 1))
  fi
done

echo ""
echo "Rendered $count diagrams ($errors errors)"
[ "$errors" -eq 0 ] || exit 1

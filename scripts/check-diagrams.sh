#!/usr/bin/env bash
# CI guard for diagram integrity.
# Usage: ./scripts/check-diagrams.sh
#
# Checks:
#   1. No inline ```mermaid blocks in markdown files
#   2. Every .mmd has a corresponding .svg and .mmd.sha256
#   3. No .mmd.sha256 hash is stale (source changed without re-rendering)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DIAGRAMS_DIR="$PROJECT_ROOT/docs/diagrams"

errors=0

# ── Check 1: No inline mermaid blocks ──────────────────────────────────

echo "Checking for inline mermaid blocks..."
# Match lines that START with ```mermaid (fenced code block opening).
# Ignore mentions of ```mermaid in prose (e.g., documentation about the rule itself).
if grep -rn '^```mermaid' "$PROJECT_ROOT"/{README.md,CONTRIBUTING.md} "$PROJECT_ROOT/docs/" \
    --include='*.md' 2>/dev/null; then
  echo ""
  echo "::error::Found inline \`\`\`mermaid blocks. Extract to docs/diagrams/*.mmd and render with scripts/render-diagrams.sh"
  errors=$((errors + 1))
else
  echo "  None found."
fi

# ── Check 2: Every .mmd has .svg and .sha256 ──────────────────────────

echo ""
echo "Checking diagram file completeness..."
for mmd in "$DIAGRAMS_DIR"/*.mmd; do
  [ -f "$mmd" ] || continue
  name="$(basename "$mmd" .mmd)"

  if [ ! -f "$DIAGRAMS_DIR/$name.svg" ]; then
    echo "::error::Missing SVG for $name.mmd — run scripts/render-diagrams.sh"
    errors=$((errors + 1))
  fi

  if [ ! -f "$mmd.sha256" ]; then
    echo "::error::Missing hash sidecar for $name.mmd — run scripts/render-diagrams.sh"
    errors=$((errors + 1))
  fi
done

# Check for orphaned SVGs (no matching .mmd source)
for svg in "$DIAGRAMS_DIR"/*.svg; do
  [ -f "$svg" ] || continue
  name="$(basename "$svg" .svg)"
  if [ ! -f "$DIAGRAMS_DIR/$name.mmd" ]; then
    echo "::error::Orphaned SVG $name.svg has no matching .mmd source"
    errors=$((errors + 1))
  fi
done
echo "  File check complete."

# ── Check 3: Source hash freshness ─────────────────────────────────────

echo ""
echo "Checking SVG freshness..."
for mmd in "$DIAGRAMS_DIR"/*.mmd; do
  [ -f "$mmd" ] || continue
  sha_file="${mmd}.sha256"
  name="$(basename "$mmd")"

  if [ ! -f "$sha_file" ]; then
    continue  # Already reported in check 2
  fi

  stored_hash="$(cat "$sha_file")"
  current_hash="$(shasum -a 256 "$mmd" | awk '{print $1}')"

  if [ "$stored_hash" != "$current_hash" ]; then
    echo "::error::Stale SVG for $name — source changed since last render. Run scripts/render-diagrams.sh"
    errors=$((errors + 1))
  fi
done
echo "  Freshness check complete."

# ── Summary ────────────────────────────────────────────────────────────

echo ""
if [ "$errors" -eq 0 ]; then
  echo "All diagram checks passed."
else
  echo "$errors error(s) found."
  exit 1
fi

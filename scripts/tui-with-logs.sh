#!/usr/bin/env bash
set -euo pipefail

CHANNEL="dashboard"
LINES="20"
DETACHED="0"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --channel)
      CHANNEL="${2:-}"
      shift 2
      ;;
    --lines)
      LINES="${2:-}"
      shift 2
      ;;
    --detached)
      DETACHED="1"
      shift
      ;;
    --help|-h)
      cat <<'EOF'
Usage: npm run tui:logs -- [--channel dashboard|actuator|all] [--lines N] [--detached]

Launches the XYPH TUI and a live log follower in tmux.

Examples:
  npm run tui:logs
  npm run tui:logs -- --channel all
  npm run tui:logs -- --channel dashboard --lines 50
EOF
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

case "$CHANNEL" in
  dashboard|actuator|all) ;;
  *)
    echo "Invalid --channel value: $CHANNEL" >&2
    exit 1
    ;;
esac

if ! [[ "$LINES" =~ ^[0-9]+$ ]]; then
  echo "Invalid --lines value: $LINES" >&2
  exit 1
fi

if ! command -v tmux >/dev/null 2>&1; then
  echo "tmux is required for npm run tui:logs. Use 'npm run tui' and 'npm run logs:follow' in separate terminals if tmux is unavailable." >&2
  exit 1
fi

WORKDIR="$PWD"
LOG_CMD="$(printf '%q ' npm run logs -- --channel "$CHANNEL" --follow --lines "$LINES")"
TUI_CMD="$(printf '%q ' npm run tui)"

if [[ -n "${TMUX:-}" ]]; then
  tmux split-window -v -p 25 -c "$WORKDIR" "$LOG_CMD"
  tmux select-pane -t "${TMUX_PANE:-.}"
  exec npm run tui
fi

SESSION_NAME="xyph-tui-$(date +%s)"
tmux new-session -d -s "$SESSION_NAME" -c "$WORKDIR" "$TUI_CMD"
tmux split-window -v -p 25 -t "${SESSION_NAME}:0" -c "$WORKDIR" "$LOG_CMD"
tmux select-pane -t "${SESSION_NAME}:0.0"

if [[ "$DETACHED" == "1" ]]; then
  echo "$SESSION_NAME"
  exit 0
fi

exec tmux attach -t "$SESSION_NAME"

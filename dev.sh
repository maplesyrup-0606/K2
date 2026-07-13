#!/usr/bin/env bash
# Launch the K2 local dev stack in a tmux session, one window split in two:
#   left pane  — Flask dev server on :5000 (auto-reload via --debug)
#   right pane — Vite dev server on :5173 (HTTPS via Tailscale certs)
#
# Access from any tailnet device at https://goon-pod.tail26570e.ts.net:5173
# (Vite proxies /api and /media to Flask.)
#
# Usage: ./dev.sh          attach (starting the session if needed)
#        ./dev.sh kill     stop the dev stack
set -euo pipefail

SESSION=k2-dev
ROOT="$(cd "$(dirname "$0")" && pwd)"

if ! command -v tmux >/dev/null; then
  echo "tmux is not installed. Install it with: sudo apt install tmux" >&2
  exit 1
fi

if [[ "${1:-}" == "kill" ]]; then
  tmux kill-session -t "$SESSION" 2>/dev/null && echo "Killed $SESSION." || echo "No $SESSION session running."
  exit 0
fi

if ! tmux has-session -t "$SESSION" 2>/dev/null; then
  tmux new-session -d -s "$SESSION" -n dev -c "$ROOT/backend"
  tmux send-keys -t "$SESSION:dev.0" 'K2/bin/flask run --debug' C-m
  tmux split-window -h -t "$SESSION:dev" -c "$ROOT/frontend"
  tmux send-keys -t "$SESSION:dev.1" 'npm run dev' C-m
  echo "Started $SESSION: backend :5000 (left), frontend https://goon-pod.tail26570e.ts.net:5173 (right)"
fi

# Attach if we have a terminal; inside tmux, switch instead
if [[ -n "${TMUX:-}" ]]; then
  tmux switch-client -t "$SESSION"
else
  tmux attach -t "$SESSION"
fi

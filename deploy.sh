#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "==> Building and restarting containers..."
docker compose down
docker compose up --build -d

echo "==> Starting Tailscale Funnel on port 8080..."
sudo tailscale funnel reset
sudo tailscale funnel --bg 8080

echo "==> Done. Status:"
docker compose ps
tailscale funnel status

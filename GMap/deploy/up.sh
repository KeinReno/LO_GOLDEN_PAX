#!/usr/bin/env bash
# Run on the VPS from the GMap project root.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  echo "Missing .env — copy .env.example and set GMAP_MASTER_TOKEN"
  exit 1
fi

docker compose up -d --build
docker compose ps
echo ""
echo "Health:"
curl -fsS "http://127.0.0.1/api/health" || curl -fsS "http://127.0.0.1:4173/api/health"
echo ""
echo "Players: http://$(hostname -I | awk '{print $1}')/view"

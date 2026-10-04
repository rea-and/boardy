#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_DIR"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Working tree has uncommitted changes. Commit or stash them before deploying." >&2
  exit 1
fi

echo "Pulling origin/main..."
git pull --ff-only origin main

echo "Running Boardy checks..."
npm run check

echo "Restarting Boardy..."
sudo systemctl restart boardy
sudo systemctl is-active --quiet boardy

echo "Waiting for Boardy health..."
healthy=0
for attempt in $(seq 1 30); do
  if curl --fail --silent http://127.0.0.1:4173/api/health >/dev/null; then
    healthy=1
    break
  fi
  sleep 1
done

if [ "$healthy" -ne 1 ]; then
  echo "Boardy did not become healthy within 30 seconds." >&2
  sudo systemctl status boardy --no-pager >&2 || true
  exit 1
fi

curl --fail --silent --show-error http://127.0.0.1:4173/api/health
printf '\nDeployment complete.\n'

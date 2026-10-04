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

echo "Checking Boardy health..."
curl --fail --silent --show-error http://127.0.0.1:4173/api/health
printf '\nDeployment complete.\n'

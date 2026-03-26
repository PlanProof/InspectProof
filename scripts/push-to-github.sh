#!/usr/bin/env bash
set -e

if [ -z "$GITHUB_PERSONAL_ACCESS_TOKEN" ]; then
  echo "ERROR: GITHUB_PERSONAL_ACCESS_TOKEN secret is not set."
  echo "Add it via the Replit Secrets panel and try again."
  exit 1
fi

REPO="https://github.com/PlanProof/InspectProof.git"
REMOTE_URL="https://${GITHUB_PERSONAL_ACCESS_TOKEN}@github.com/PlanProof/InspectProof.git"

echo "==> Configuring remote..."
git remote set-url github "$REMOTE_URL" 2>/dev/null || git remote add github "$REMOTE_URL"

echo "==> Pushing master → main..."
git push github master:main --force

echo "==> Cleaning token from remote URL..."
git remote set-url github "$REPO"

echo ""
echo "✓ Successfully pushed to github.com/PlanProof/InspectProof (main)"

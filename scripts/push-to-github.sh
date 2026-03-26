#!/usr/bin/env bash
set -e

if [ -z "$GITHUB_PERSONAL_ACCESS_TOKEN" ]; then
  echo "ERROR: GITHUB_PERSONAL_ACCESS_TOKEN secret is not set."
  echo "Add it via the Replit Secrets panel and try again."
  exit 1
fi

REPO_URL="https://github.com/PlanProof/InspectProof.git"

echo "==> Ensuring remote 'github' points to ${REPO_URL}..."
if git remote get-url github &>/dev/null; then
  git remote set-url github "$REPO_URL"
else
  git remote add github "$REPO_URL"
fi

echo "==> Pushing master → main..."
# Pass credentials via git's credential helper (token never appears in the URL
# or process list — only passed through git's internal stdin protocol).
git \
  -c "credential.helper=!f(){ echo username=x; echo password=\$GITHUB_PERSONAL_ACCESS_TOKEN; }; f" \
  push github master:main --force

echo ""
echo "Successfully pushed to github.com/PlanProof/InspectProof (main)"

#!/usr/bin/env bash
set -euo pipefail

SKILL_SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "=== [1/3] Creating documents/ structure and copying skill into documents/skills/sdd-tdd-pwa-webapp ==="
mkdir -p documents/adr documents/epics documents/skills
rm -rf documents/skills/sdd-tdd-pwa-webapp
cp -R "$SKILL_SRC_DIR" documents/skills/sdd-tdd-pwa-webapp
echo "OK: Skill copied to documents/skills/sdd-tdd-pwa-webapp"

echo "=== [2/3] Creating and installing after-merge (post-merge) Git hook ==="
mkdir -p .githooks
cat << 'EOF' > .githooks/post-merge
#!/usr/bin/env bash
set -euo pipefail

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"

if [[ "$CURRENT_BRANCH" == "main" ]]; then
  echo "[after-merge hook] Merge into 'main' detected. Running production build into docs/..."
  npm run build
  echo "[after-merge hook] Production build successfully written to docs/."
fi
EOF
chmod +x .githooks/post-merge

if [[ -d ".git" ]]; then
  mkdir -p .git/hooks
  cp .githooks/post-merge .git/hooks/post-merge
  chmod +x .git/hooks/post-merge
  git config core.hooksPath .githooks || true
  echo "OK: Installed .githooks/post-merge and .git/hooks/post-merge"
else
  echo "WARN: .git directory not initialized yet; .githooks/post-merge created and ready."
fi

echo "=== [3/3] Ensuring docs/ exists for production build output ==="
mkdir -p docs
echo "OK: Project SDD structure, bundled skill in documents/, and after-merge hook are ready."

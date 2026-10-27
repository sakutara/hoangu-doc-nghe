#!/usr/bin/env bash
set -euo pipefail

echo "=== [1/8] Checking Root README.md for SDD & UI Multi-Agent Instructions ==="
if [[ ! -f "README.md" ]]; then
  echo "ERROR: Missing README.md at repository root"
  exit 1
fi
if ! grep -qi "BR-MASTER" README.md || ! grep -qi "SA-MASTER" README.md; then
  echo "ERROR: README.md must document the SDD workflow (epic <YYYY-MM-DD> -> BR -> SA, BR-MASTER, SA-MASTER) for all agents"
  exit 1
fi
echo "OK: README.md exists and contains SDD governance instructions."

echo "=== [2/8] Checking Master Documentation in documents/ ==="
if [[ ! -f "documents/BR-MASTER.md" ]]; then
  echo "ERROR: Missing documents/BR-MASTER.md"
  exit 1
fi
if [[ ! -f "documents/SA-MASTER.md" ]]; then
  echo "ERROR: Missing documents/SA-MASTER.md"
  exit 1
fi
if ! grep -qi "epics/epic-" documents/BR-MASTER.md; then
  echo "ERROR: documents/BR-MASTER.md must link to date-named epics (epics/epic-YYYY-MM-DD...) for features"
  exit 1
fi
echo "OK: documents/BR-MASTER.md and documents/SA-MASTER.md exist and link to epics."

echo "=== [3/8] Checking Bundled Skill Copy in documents/skills/sdd-tdd-pwa-webapp/ ==="
if [[ ! -f "documents/skills/sdd-tdd-pwa-webapp/SKILL.md" ]]; then
  echo "ERROR: Missing bundled skill copy at documents/skills/sdd-tdd-pwa-webapp/SKILL.md"
  exit 1
fi
echo "OK: Skill copy exists in documents/skills/sdd-tdd-pwa-webapp/."

echo "=== [4/8] Checking ADR Directory (documents/adr/) ==="
if [[ ! -d "documents/adr" ]]; then
  echo "ERROR: Missing documents/adr directory"
  exit 1
fi
adr_count=$(find documents/adr -maxdepth 1 -name "ADR-*.md" | wc -l | tr -d ' ')
if [[ "$adr_count" -eq 0 ]]; then
  echo "ERROR: No ADR-*.md files found in documents/adr/"
  exit 1
fi
echo "OK: Found $adr_count ADR file(s) in documents/adr/."

echo "=== [5/8] Checking Date-Named Epic Documentation (epic <YYYY-MM-DD> in documents/epics/) ==="
if [[ ! -d "documents/epics" ]]; then
  echo "ERROR: Missing documents/epics directory"
  exit 1
fi

epic_dirs=$(find documents/epics -mindepth 1 -maxdepth 1 -type d | sort)
if [[ -z "$epic_dirs" ]]; then
  echo "ERROR: No epic directories found in documents/epics/"
  exit 1
fi

for dir in $epic_dirs; do
  base_dir=$(basename "$dir")
  if [[ ! "$base_dir" =~ ^epic-[0-9]{4}-[0-9]{2}-[0-9]{2} ]]; then
    echo "ERROR: Epic directory '$base_dir' must be named by date: epic-YYYY-MM-DD or epic-YYYY-MM-DD-<slug>"
    exit 1
  fi
  br_files=$(find "$dir" -maxdepth 1 -name "BR-EPIC-*.md" | wc -l | tr -d ' ')
  sa_files=$(find "$dir" -maxdepth 1 -name "SA-EPIC-*.md" | wc -l | tr -d ' ')
  if [[ "$br_files" -ne 1 || "$sa_files" -ne 1 ]]; then
    echo "ERROR: Epic directory '$dir' must have exactly 1 BR-EPIC-*.md and 1 SA-EPIC-*.md (found BR=$br_files, SA=$sa_files)"
    exit 1
  fi
  echo "OK: $dir is date-named and has 1 BR and 1 SA."
done

echo "=== [6/8] Checking after-merge (post-merge) Git Hook ==="
if [[ ! -x ".githooks/post-merge" && ! -x ".git/hooks/post-merge" ]]; then
  echo "ERROR: Missing executable after-merge hook (.githooks/post-merge or .git/hooks/post-merge)"
  exit 1
fi
echo "OK: Executable after-merge (post-merge) hook is configured."

echo "=== [7/8] Checking Viewport Zoom Lock in index.html ==="
if [[ -f "index.html" ]]; then
  if ! grep -qi "user-scalable=no" index.html || ! grep -qi "maximum-scale=1.0" index.html; then
    echo "ERROR: index.html must disable zooming (user-scalable=no, maximum-scale=1.0)"
    exit 1
  fi
  echo "OK: index.html has zoom disabled."
fi

echo "=== [8/8] Checking Test Coverage (>= 90%) & Production Build to docs/ ==="
if [[ -f "package.json" ]]; then
  npm run test:coverage
  npm run build
  if [[ ! -f "docs/index.html" ]]; then
    echo "ERROR: Production build did not output docs/index.html. Ensure vite.config.ts has build.outDir = 'docs'."
    exit 1
  fi
  echo "OK: Production build output verified in docs/index.html."
else
  echo "SKIP: No package.json found in current directory."
fi

echo "=== ALL SDD + TDD BILINGUAL PWA WEBAPP GATES PASSED ==="

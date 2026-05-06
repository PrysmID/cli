#!/usr/bin/env bash
# Local release script — no CI/CD by design.
#
# Why this is local-only:
#   The Google-Drive-mounted workspace (G:\) corrupts npm postinstalls (esbuild
#   bundled in tsup) due to long Windows UNC paths. So `npm install + build`
#   only works in a non-Drive checkout. Rather than maintain a brittle GH
#   Actions workflow that papers over that, we publish from a local clone
#   under C:\Users\<you>\dev\prysmid-cli (or any non-Drive path).
#
#   When that environment constraint goes away (CLI rewritten without esbuild,
#   or workspace moved off Drive), we can revisit. Until then: local + manual.
#
# Pre-reqs:
#   - You are running this from a clone that is NOT inside the Google Drive
#     mount. The script aborts otherwise.
#   - npm is logged in (or ~/.npmrc has `_authToken` for the @prysmid scope).
#   - Working tree is clean and on `main` synced with origin.
#
# Usage:
#   ./scripts/publish.sh patch          # bump 0.1.0 → 0.1.1, build, publish, tag, push
#   ./scripts/publish.sh minor          # 0.1.0 → 0.2.0
#   ./scripts/publish.sh major          # 0.1.0 → 1.0.0
#   ./scripts/publish.sh 0.1.5          # explicit version
#   ./scripts/publish.sh --dry-run patch   # do everything except npm publish + git push
#
# What it does (in order):
#   1. Sanity checks: non-Drive cwd, clean tree, on main, in sync with origin.
#   2. Smoke-test the current build (or rebuild if missing).
#   3. `npm version <bump>` — updates package.json + creates git tag.
#   4. `npm install --no-audit --no-fund` (in case lockfile drifted).
#   5. `npm run build`.
#   6. Smoke-test the new build (`prysmid --version`, `describe-tools | jq`).
#   7. `npm publish --access public`.
#   8. `git push origin main && git push origin <tag>`.
#
# Failure mode:
#   If anything fails after `npm version`, the local commit/tag exist but
#   nothing was published or pushed. To recover:
#     git tag -d v<x.y.z>
#     git reset --hard HEAD~1
#   Then fix the underlying issue and rerun.

set -euo pipefail

DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
  shift
fi

BUMP="${1:-}"
if [[ -z "$BUMP" ]]; then
  echo "usage: $0 [--dry-run] <patch|minor|major|x.y.z>" >&2
  exit 2
fi

# 1. Sanity checks ----------------------------------------------------------

CWD="$(pwd)"
if [[ "$CWD" == /g/* || "$CWD" == /G/* || "$CWD" == "G:"* || "$CWD" == "g:"* ]]; then
  echo "error: refusing to publish from Google Drive mount ($CWD)." >&2
  echo "       Clone the repo under C:\\Users\\<you>\\dev\\prysmid-cli and run from there." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "error: working tree is dirty. Commit or stash first." >&2
  git status --short >&2
  exit 1
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH" != "main" ]]; then
  echo "error: must be on main, currently on '$BRANCH'." >&2
  exit 1
fi

git fetch origin main --quiet
if [[ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]]; then
  echo "error: local main is not in sync with origin/main." >&2
  echo "       local:  $(git rev-parse --short HEAD)" >&2
  echo "       remote: $(git rev-parse --short origin/main)" >&2
  exit 1
fi

# 2. Smoke-test current build (build if dist missing) -----------------------

if [[ ! -f dist/index.js ]]; then
  echo "[publish] dist/ missing, building first…"
  npm install --no-audit --no-fund
  npm run build
fi
node dist/index.js --version >/dev/null
echo "[publish] current build smoke OK"

# 3. Bump version (creates commit + tag locally) ----------------------------

echo "[publish] npm version $BUMP"
NEW_VERSION="$(npm version "$BUMP" --no-git-tag-version)"     # bump package.json only
NEW_VERSION="${NEW_VERSION#v}"                                 # strip leading v
git add package.json
git commit -m "chore(release): v${NEW_VERSION}" --quiet
git tag "v${NEW_VERSION}"
echo "[publish] local commit + tag v${NEW_VERSION} created"

# 4-5. Reinstall + build ----------------------------------------------------

npm install --no-audit --no-fund
npm run build

# 6. Smoke-test new build ---------------------------------------------------

OUT_VERSION="$(node dist/index.js --version)"
if [[ "$OUT_VERSION" != "$NEW_VERSION" ]]; then
  echo "error: built CLI reports version '$OUT_VERSION', expected '$NEW_VERSION'." >&2
  exit 1
fi
node dist/index.js describe-tools --json | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
  const j=JSON.parse(s);
  if(!j.commands || j.commands.length<10){
    console.error("describe-tools returned suspiciously few commands:", j.commands?.length);
    process.exit(1);
  }
});'
echo "[publish] new build smoke OK (v${NEW_VERSION}, $(node dist/index.js describe-tools --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).commands.length))') commands)"

# 7. npm publish ------------------------------------------------------------

if [[ "$DRY_RUN" == 1 ]]; then
  echo "[publish] DRY RUN — skipping npm publish + git push"
  echo "[publish] to roll back: git tag -d v${NEW_VERSION} && git reset --hard HEAD~1"
  exit 0
fi

echo "[publish] npm publish --access public"
npm publish --access public

# 8. Push to GitHub ---------------------------------------------------------

git push origin main
git push origin "v${NEW_VERSION}"

echo ""
echo "[publish] DONE — @prysmid/cli@${NEW_VERSION} is live."
echo "[publish] verify: npm view @prysmid/cli version"
echo "[publish] tag:    https://github.com/PrysmID/cli/releases/tag/v${NEW_VERSION}"

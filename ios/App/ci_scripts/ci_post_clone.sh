#!/bin/sh

# ============================================================================
# Xcode Cloud — post-clone build step for the Capacitor iOS app.
#
# Xcode Cloud clones the repo and runs `xcodebuild`, but the web bundle
# (ios/App/App/public) plus the generated capacitor.config.json / config.xml are
# gitignored, so a fresh checkout is missing those build inputs and xcodebuild
# fails with "Build input file cannot be found".
#
# This script (run automatically right after the clone) installs Node, builds
# the web app, and runs `cap sync ios` to regenerate those files before the
# build phase. Node is not preinstalled on Xcode Cloud images, so we install it
# via Homebrew (pinned to 20 to match the web deploy / Vite's requirement).
# ============================================================================

set -e

echo "▸ Installing Node 20 via Homebrew…"
brew install node@20
export PATH="$(brew --prefix node@20)/bin:$PATH"

echo "▸ Node: $(node -v) | npm: $(npm -v)"

# Xcode Cloud checks the repo out at CI_PRIMARY_REPOSITORY_PATH; package.json
# lives at its root.
cd "$CI_PRIMARY_REPOSITORY_PATH"

echo "▸ Installing JS dependencies (npm ci)…"
npm ci

echo "▸ Building the web app (npm run build)…"
npm run build

echo "▸ Syncing the web bundle + config into iOS (cap sync ios)…"
npx cap sync ios

echo "✓ Post-clone build prep complete."

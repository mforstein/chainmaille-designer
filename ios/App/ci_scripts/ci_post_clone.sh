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
# build phase. Node is not preinstalled on Xcode Cloud images. Capacitor CLI 8
# requires Node >= 22, so we install node@22 (Vite 7 is happy on it too).
# ============================================================================

set -e
set -x  # verbose: echo each command into the Xcode Cloud build log

# Make sure Homebrew is on PATH (Xcode Cloud images).
if [ -x /opt/homebrew/bin/brew ]; then
  eval "$(/opt/homebrew/bin/brew shellenv)"
elif [ -x /usr/local/bin/brew ]; then
  eval "$(/usr/local/bin/brew shellenv)"
fi

echo "▸ Installing Node 22 via Homebrew (Capacitor CLI 8 needs Node >= 22)…"
brew install node@22
export PATH="$(brew --prefix node@22)/bin:$PATH"
node -v
npm -v

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

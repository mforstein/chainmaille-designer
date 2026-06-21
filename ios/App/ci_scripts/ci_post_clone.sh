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

# Vite inlines client config (Supabase URL/key, Stripe price ids) from .env files
# at build time, but .env.local is gitignored — so a CI checkout builds a bundle
# with NO auth config and the app shows "Auth not configured". Recreate .env.local
# here from Xcode Cloud environment variables. These are CLIENT-SAFE values (the
# VITE_ vars already ship in the public web bundle); do NOT put server secrets
# (STRIPE_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY, etc.) into Xcode Cloud.
# Disable command echo while writing so values never land in the build log.
echo "▸ Writing .env.local from Xcode Cloud environment variables…"
set +x
: > .env.local
for V in \
  VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY \
  VITE_STRIPE_PRICE_CRAFTER VITE_STRIPE_PRICE_MAKER VITE_STRIPE_PRICE_STUDIO \
  VITE_STRIPE_PAYMENT_LINK_CRAFTER VITE_STRIPE_PAYMENT_LINK_MAKER VITE_STRIPE_PAYMENT_LINK_STUDIO; do
  eval "VAL=\${$V:-}"
  if [ -n "$VAL" ]; then printf '%s=%s\n' "$V" "$VAL" >> .env.local; fi
done
set -x
echo "  .env.local now has $(grep -c '=' .env.local 2>/dev/null || echo 0) VITE_ vars"
if ! grep -q '^VITE_SUPABASE_URL=' .env.local; then
  echo "⚠️  VITE_SUPABASE_URL not set in Xcode Cloud — this build will have NO auth!"
fi

echo "▸ Building the web app (npm run build)…"
npm run build

echo "▸ Syncing the web bundle + config into iOS (cap sync ios)…"
npx cap sync ios

# The web build bundles ~200MB of marketing/showcase art (images/designer,
# designer.zip, images/etsy, Archive.zip, …) that the NATIVE app never uses.
# Left in, the iOS bundle balloons to ~213MB and the Xcode Cloud archive runs
# the runner out of disk / produces an oversized app. Strip those web-only
# assets from the synced bundle; the live website (which does serve them) is
# untouched. Keep manual/, braid-reference.jpeg, icons/, logos.
echo "▸ Pruning web-only marketing assets from the iOS app bundle…"
IOS_PUBLIC="ios/App/App/public"
rm -rf \
  "$IOS_PUBLIC/images/designer" \
  "$IOS_PUBLIC/images/designer.zip" \
  "$IOS_PUBLIC/images/etsy" \
  "$IOS_PUBLIC/images/etsy 2.zip" \
  "$IOS_PUBLIC/Archive.zip" \
  "$IOS_PUBLIC/IMG_4282.heic" \
  "$IOS_PUBLIC/WovenRainbowsByErin - Etsy.html" \
  "$IOS_PUBLIC/braid-reference.old.jpeg" \
  2>/dev/null || true
echo "  iOS bundle is now $(du -sh "$IOS_PUBLIC" 2>/dev/null | cut -f1)"

echo "✓ Post-clone build prep complete."

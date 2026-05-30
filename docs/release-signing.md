# Release Signing & Store Submission

Reference for shipping Chainmail Studio to Google Play and the Apple App Store.

---

## Android — One-time setup

### 1. Generate the release keystore

Run from project root:

```bash
./gen-keystore.sh
```

`keytool` will prompt for:

- **Keystore password** — used to open the keystore file itself
- **Distinguished Name** fields (your name, organizational unit, org, city, state, country code)
- **Key password** — used to sign with the `chainmail` alias (can match the keystore password)

The keystore lands at `~/chainmail-release.keystore`. The script uses `-keyalg RSA -keysize 2048 -validity 10000` — ~27 years of validity.

### ⚠️ Back up the keystore the moment it's created

```bash
# Copy to your password manager or an encrypted external drive:
cp ~/chainmail-release.keystore /Volumes/3Bang/secrets/chainmail-release.keystore
```

**If you lose this keystore, you can never publish another update to the existing Play Store listing.** Play Store requires that subsequent uploads be signed with the same key as the first. There is no recovery. Back it up.

### 2. Tell Gradle where the keystore lives

The Android `app/build.gradle` reads four properties: `KEYSTORE_FILE`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`. The cleanest place for these is your user-level Gradle properties file (outside the repo):

```bash
mkdir -p ~/.gradle
cat >> ~/.gradle/gradle.properties <<EOF
KEYSTORE_FILE=/Users/micahforstein/chainmail-release.keystore
KEYSTORE_PASSWORD=YOUR_KEYSTORE_PASSWORD_HERE
KEY_ALIAS=chainmail
KEY_PASSWORD=YOUR_KEY_PASSWORD_HERE
EOF
chmod 600 ~/.gradle/gradle.properties
```

Replace the password placeholders with the values you typed during keystore generation. The file is outside the repo and only readable by you.

### 3. Build the release Android App Bundle (`.aab`)

From project root:

```bash
npm run build                      # produce dist/
npx cap sync android               # copy dist into native project
cd android
./gradlew bundleRelease
```

Output: `android/app/build/outputs/bundle/release/app-release.aab`

That `.aab` is what you upload to Google Play Console. (Do not upload `.apk`; Play Store hasn't accepted those for new app entries since 2021.)

### 4. (Optional) Test on a physical Android device

```bash
cd android
./gradlew installRelease            # installs signed release build to attached device
```

### 5. Sign in to [Google Play Console](https://play.google.com/console)

You said the Play Console account is active. New app flow:

1. **Create app** → name "Chainmail Studio", language, free/paid (free for v1)
2. **App content** — fill out:
   - Privacy policy URL: `https://chainmaildesigner.com/privacy`
   - App access (does it have a login? yes, optional)
   - Ads (no)
   - Content rating questionnaire
   - Target audience and content (13+, not directed at children)
   - News app (no)
   - Data safety form — be accurate: collects email + designs, encrypted in transit, user can request deletion
   - Government app (no)
3. **Main store listing** — short description (80 chars), full description (4000 chars), app icon, feature graphic (1024×500), screenshots (phone + tablet)
4. **Release** → **Internal testing** → upload `app-release.aab`. Add yourself + a few testers by email. Once review passes (usually minutes), testers get a Play Store link.
5. Promote: Internal → Closed → Open → Production over a week.

---

## iOS — One-time setup (requires active Apple Developer Program membership)

### 1. Enroll in the Apple Developer Program

[developer.apple.com/programs/enroll](https://developer.apple.com/programs/enroll) → $99/year. Pick **Individual** unless you need to publish under a business name (DBA / LLC). Approval is usually 24–48 hours; sometimes longer if Apple flags your ID for manual review.

### 2. Register the App ID

In [Apple Developer → Identifiers](https://developer.apple.com/account/resources/identifiers/list):

- Type: **App ID**
- Description: "Chainmail Studio"
- Bundle ID: `com.wovenrainbows.chainmailledesigner` (must match `capacitor.config.ts`)
- Capabilities: enable **Camera** and **Photo Library** (matches our Capacitor plugins)

### 3. Create the App Store Connect entry

[appstoreconnect.apple.com](https://appstoreconnect.apple.com) → My Apps → "+" → New App:

- Platform: iOS
- Name: Chainmail Studio
- Primary language: English (US)
- Bundle ID: select the App ID you registered
- SKU: anything internal-only (e.g. `chainmail-studio-ios`)
- User access: Full

### 4. Build, archive, upload from Xcode

```bash
npm run build
npx cap sync ios
npx cap open ios     # opens Xcode
```

In Xcode:

1. Select the **App** scheme, target **Any iOS Device (arm64)**
2. **Signing & Capabilities** → set your Team (your Apple Dev account)
3. Bump **Build** number if this isn't the first archive (Marketing Version stays 1.0 for v1)
4. **Product → Archive** (takes 1–5 min)
5. When the Organizer opens: **Distribute App → App Store Connect → Upload**
6. Wait ~10–30 min for Apple to process the binary; you'll get an email

### 5. Fill the App Store listing

In App Store Connect → your app → 1.0 prepare for submission:

- Screenshots: required for **6.7" iPhone** (1290×2796) and **12.9" iPad** (2048×2732) — supply 3–10 per device
- Description, keywords (100 chars total comma-separated), support URL, marketing URL
- **Privacy policy URL**: `https://chainmaildesigner.com/privacy`
- **App Privacy** section — declare what's collected per Apple's nutrition-label schema:
  - Email Address — used for App Functionality, linked to user
  - User Content (designs) — used for App Functionality, linked to user
  - No tracking, no third-party advertising
- Age rating: 4+ (no objectionable content)
- Pricing: Free
- Submit for review → choose **TestFlight first** for a beta, then **Submit for Review** to the App Store

Review typically takes 1–3 days. Most rejections in v1 apps are around App Store Guideline 4.2 (Minimum Functionality) — the bundled web build plus Camera/Share native plugins should satisfy this, but expect a possible round of "what unique value does your iOS app offer?" if the reviewer doesn't see the native pieces in use.

---

## Where things live (paths summary)

| Thing | Path |
|---|---|
| Keystore | `~/chainmail-release.keystore` (and backup at `/Volumes/3Bang/secrets/`) |
| Keystore passwords | `~/.gradle/gradle.properties` (chmod 600) |
| Release `.aab` | `android/app/build/outputs/bundle/release/app-release.aab` |
| iOS workspace | `ios/App/App.xcworkspace` (open with `npx cap open ios`) |
| Privacy policy (live) | `https://chainmaildesigner.com/privacy` |
| EULA (live) | `https://chainmaildesigner.com/eula` |

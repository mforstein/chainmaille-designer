import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.wovenrainbows.chainmailledesigner",
  appName: "Chainmail Studio",
  webDir: "dist",
  server: {
    // In production builds the app serves from the local bundle.
    // Remove androidScheme override to keep default capacitor:// scheme.
    androidScheme: "https",
  },
  plugins: {
    Camera: {
      // Camera plugin — used for importing reference images
    },
    Share: {
      // Share plugin — used for exporting PDFs to Files/Drive
    },
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: true,
  },
  ios: {
    // "never" (not "automatic"): the app already uses viewport-fit=cover and
    // handles safe areas via CSS env(), so the WKWebView must NOT add its own
    // automatic content inset. With "automatic", the inset differs between
    // portrait (large top inset for the Dynamic Island) and landscape (~none),
    // and after a rotation the rendered position and the touch HIT-TEST get
    // offset by that inset — so in portrait the floating panels render where you
    // see them but accept taps elsewhere, i.e. they "lock" (grip highlights in
    // landscape but not portrait). "never" keeps render and hit-test aligned.
    contentInset: "never",
    scrollEnabled: true,
    limitsNavigationsToAppBoundDomains: true,
  },
};

export default config;

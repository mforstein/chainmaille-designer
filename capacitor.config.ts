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
    webContentsDebuggingEnabled: false,
  },
  ios: {
    contentInset: "automatic",
    scrollEnabled: true,
    limitsNavigationsToAppBoundDomains: true,
  },
};

export default config;

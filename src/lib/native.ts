// ======================================================
// src/lib/native.ts
// Native-app (Capacitor) detection + store-compliance flag.
//
// Apple App Store (3.1.1) and Google Play both forbid showing prices for, or
// steering users toward, an external (web) purchase for digital goods. This app
// sells subscriptions ONLY on the website; the native apps ship Free-tier and
// simply unlock paid tiers for accounts that already subscribed on the web.
//
// So in the native build we must HIDE all pricing, "subscribe on the website"
// links, and the /pricing page. Gate that UI behind HIDE_STORE_PURCHASE_UI.
// The website (where purchasing is allowed) keeps everything.
// ======================================================

import { Capacitor } from "@capacitor/core";

export const IS_NATIVE = Capacitor.isNativePlatform();

/** True in the iOS/Android app builds — hide prices & external-purchase steering. */
export const HIDE_STORE_PURCHASE_UI = IS_NATIVE;

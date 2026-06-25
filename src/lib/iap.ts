// ======================================================
// src/lib/iap.ts
// RevenueCat in-app purchase wrapper (native only).
//
// On iOS/Android the app must sell subscriptions through the platform's
// billing (App Store IAP / Play Billing) — see [[ios-store-compliance]].
// RevenueCat unifies both stores + receipt validation + entitlements, and a
// RevenueCat webhook keeps Supabase `user_metadata.tier` in sync server-side.
//
// Configure with the public SDK keys (safe to ship) from env:
//   VITE_REVENUECAT_IOS_KEY      (appl_…)
//   VITE_REVENUECAT_ANDROID_KEY  (goog_…)
//
// Product IDs (must match App Store Connect / Play / RevenueCat):
//   chainmail_maker_monthly / chainmail_crafter_monthly / chainmail_studio_monthly
// Entitlement IDs in RevenueCat: maker / crafter / studio
// ======================================================

import { Capacitor } from "@capacitor/core";
import type { Tier } from "../auth/AuthContext";

// Lazy import so the web bundle never pulls native-only code paths at import time.
type PurchasesModule = typeof import("@revenuecat/purchases-capacitor");
let _mod: PurchasesModule | null = null;
let _configured = false;

// RevenueCat PUBLIC SDK keys are safe to embed in the app (they're not secrets).
// Env overrides are honored if set; otherwise these baked defaults are used so
// cloud builds work without extra env plumbing.
const IOS_KEY =
  (import.meta.env.VITE_REVENUECAT_IOS_KEY as string | undefined) ||
  "appl_fAMAisyVmWHALFrzEdtJmwssSBi";
const ANDROID_KEY =
  (import.meta.env.VITE_REVENUECAT_ANDROID_KEY as string | undefined) || "";

/** Tiers ranked low→high so we can pick the strongest active entitlement. */
const TIER_RANK: Record<string, number> = { maker: 1, crafter: 2, studio: 3 };

export function iapAvailable(): boolean {
  if (!Capacitor.isNativePlatform()) return false;
  const key = Capacitor.getPlatform() === "ios" ? IOS_KEY : ANDROID_KEY;
  return !!key;
}

async function mod(): Promise<PurchasesModule> {
  if (!_mod) _mod = await import("@revenuecat/purchases-capacitor");
  return _mod;
}

/** Configure the SDK and associate purchases with the signed-in account. */
export async function initIAP(appUserId: string | null): Promise<void> {
  if (!iapAvailable()) return;
  const { Purchases, LOG_LEVEL } = await mod();
  const apiKey = (Capacitor.getPlatform() === "ios" ? IOS_KEY : ANDROID_KEY)!;
  if (!_configured) {
    await Purchases.setLogLevel({ level: LOG_LEVEL.WARN });
    await Purchases.configure({ apiKey, appUserID: appUserId ?? undefined });
    _configured = true;
  } else if (appUserId) {
    await Purchases.logIn({ appUserID: appUserId });
  }
}

export interface IapPackage {
  id: string;            // RevenueCat package identifier
  productId: string;     // store product id
  tier: Tier;            // derived from product id
  priceString: string;   // localized price, e.g. "$5.99"
  title: string;
  raw: any;              // the underlying RC package, passed back to purchase()
}

function tierFromProductId(productId: string): Tier {
  if (/studio/i.test(productId)) return "studio";
  if (/crafter/i.test(productId)) return "crafter";
  if (/maker/i.test(productId)) return "maker";
  return "free";
}

/** Fetch the current offering's purchasable packages. */
export async function getPackages(): Promise<IapPackage[]> {
  if (!iapAvailable()) return [];
  const { Purchases } = await mod();
  const offerings = await Purchases.getOfferings();
  const current = offerings.current;
  if (!current) return [];
  return current.availablePackages.map((p) => {
    const productId = p.product.identifier;
    return {
      id: p.identifier,
      productId,
      tier: tierFromProductId(productId),
      priceString: p.product.priceString,
      title: p.product.title,
      raw: p,
    };
  });
}

/** Purchase a package; returns the tier now unlocked (or null if not purchased). */
export async function purchase(pkg: IapPackage): Promise<Tier | null> {
  if (!iapAvailable()) return null;
  const { Purchases } = await mod();
  try {
    const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg.raw });
    return tierFromCustomerInfo(customerInfo);
  } catch (e: any) {
    if (e?.userCancelled) return null;
    throw e;
  }
}

/** Restore prior purchases (required by Apple); returns the unlocked tier. */
export async function restore(): Promise<Tier> {
  if (!iapAvailable()) return "free";
  const { Purchases } = await mod();
  const { customerInfo } = await Purchases.restorePurchases();
  return tierFromCustomerInfo(customerInfo);
}

/** Read the current entitlement state and return the strongest active tier. */
export async function currentTier(): Promise<Tier> {
  if (!iapAvailable()) return "free";
  const { Purchases } = await mod();
  const { customerInfo } = await Purchases.getCustomerInfo();
  return tierFromCustomerInfo(customerInfo);
}

function tierFromCustomerInfo(info: any): Tier {
  const active = info?.entitlements?.active ?? {};
  let best: Tier = "free";
  const bump = (t: Tier) => {
    if ((TIER_RANK[t] ?? 0) > (TIER_RANK[best] ?? 0)) best = t;
  };
  for (const key of Object.keys(active)) {
    // 1) entitlement identifier matches a tier name (case-insensitive)
    const lk = key.toLowerCase();
    if (lk in TIER_RANK) bump(lk as Tier);
    // 2) otherwise derive the tier from the active product id — robust to
    //    however the entitlement happens to be named in RevenueCat.
    const pid = (active[key]?.productIdentifier as string) || "";
    if (pid) bump(tierFromProductId(pid));
  }
  return best;
}

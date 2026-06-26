// netlify/functions/revenuecat-webhook.ts
// Receives RevenueCat webhook events and syncs the in-app (App Store / Play)
// subscription tier to Supabase user metadata — the native counterpart of
// stripe-webhook.ts. A purchase elevates the signed-in account; a lapse
// downgrades it. This makes the tier purely account-based (a signed-out or
// different free account never inherits a device's subscription).
//
// Required env vars (Netlify dashboard):
//   SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_URL
//   REVENUECAT_WEBHOOK_SECRET  (the Authorization header value set in RevenueCat)
//
// RevenueCat → Integrations → Webhooks:
//   URL:  https://chainmaildesigner.com/.netlify/functions/revenuecat-webhook
//   Authorization header:  <REVENUECAT_WEBHOOK_SECRET>
//
// app_user_id is the Supabase user UUID — the app calls Purchases.logIn(user.id),
// so events for a signed-in purchase carry the right user.

import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

function tierFromProductId(productId: string): string {
  if (/studio/i.test(productId)) return "studio";
  if (/crafter/i.test(productId)) return "crafter";
  if (/maker/i.test(productId)) return "maker";
  return "free";
}

async function setUserTier(userId: string, tier: string) {
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: { tier }, // GoTrue shallow-merges, so other metadata is kept
  });
  if (error) console.error("RC webhook — Supabase update failed:", error.message);
  else console.log(`RC webhook — user ${userId} → tier:${tier}`);
}

export const handler = async (event: any) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  // RevenueCat sends the Authorization header value you configure on the webhook.
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
  if (secret) {
    const auth = event.headers["authorization"] ?? event.headers["Authorization"];
    if (auth !== secret) return { statusCode: 401, body: "Unauthorized" };
  }

  let body: any;
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "Bad JSON" }; }
  const ev = body?.event;
  if (!ev) return { statusCode: 200, body: "no event" };

  const appUserId: string | undefined = ev.app_user_id;
  // Only sync for real Supabase accounts (anonymous purchases have no account).
  if (!appUserId || appUserId.startsWith("$RCAnonymousID")) {
    return { statusCode: 200, body: "anonymous; skipped" };
  }

  const type: string = ev.type;
  const productId: string = ev.product_id ?? (ev.product_ids?.[0] ?? "");

  let tier: string | null = null;
  switch (type) {
    // Active / re-activated subscription → set tier from the product.
    case "INITIAL_PURCHASE":
    case "RENEWAL":
    case "UNCANCELLATION":
    case "PRODUCT_CHANGE":
    case "NON_RENEWING_PURCHASE":
      tier = tierFromProductId(productId);
      break;
    // Subscription actually ended → drop to free.
    case "EXPIRATION":
      tier = "free";
      break;
    // CANCELLATION (still active until expiry), BILLING_ISSUE (grace period),
    // SUBSCRIPTION_PAUSED, TRANSFER, TEST → no immediate tier change.
    default:
      return { statusCode: 200, body: `ignored: ${type}` };
  }

  try {
    await setUserTier(appUserId, tier);
  } catch (err: any) {
    console.error("RC webhook handler error:", err?.message);
    return { statusCode: 500, body: "Internal error" };
  }
  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};

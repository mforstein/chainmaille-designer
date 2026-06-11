// netlify/functions/stripe-webhook.ts
// Receives Stripe webhook events and syncs subscription tier to Supabase user metadata.
//
// Required env vars (Netlify dashboard):
//   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
//   SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_URL
//
// Events handled:
//   checkout.session.completed       → set tier from price ID
//   customer.subscription.updated    → update tier (handles upgrades / downgrades)
//   customer.subscription.deleted    → reset tier to "free"

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-04-30.basil",
});

// Admin client — bypasses RLS to update user metadata
const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const PRICE_TO_TIER: Record<string, string> = {
  [process.env.VITE_STRIPE_PRICE_MAKER ?? ""]:   "maker",
  [process.env.VITE_STRIPE_PRICE_CRAFTER ?? ""]: "crafter",
  [process.env.VITE_STRIPE_PRICE_STUDIO ?? ""]:  "studio",
};

function priceIdToTier(priceId: string): string {
  return PRICE_TO_TIER[priceId] ?? "free";
}

const TIER_RANK: Record<string, number> = { free: 0, maker: 1, crafter: 2, studio: 3 };

// Resolve the tier the customer is still entitled to from their remaining
// active subscriptions, ignoring `excludeSubId` (the one being canceled/lapsed).
// Returns the highest-ranked active tier, or "free" if none remain.
// Guards against blindly downgrading a user who has another active sub
// (e.g. a duplicate signup).
async function activeTierForCustomer(customerId: string, excludeSubId?: string): Promise<string> {
  const subs = await stripe.subscriptions.list({ customer: customerId, status: "active", limit: 100 });
  let best = "free";
  for (const s of subs.data) {
    if (s.id === excludeSubId) continue;
    const t = priceIdToTier(s.items.data[0].price.id);
    if ((TIER_RANK[t] ?? 0) > (TIER_RANK[best] ?? 0)) best = t;
  }
  return best;
}

async function supabaseUserIdFromCustomer(customerId: string): Promise<string | null> {
  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted) return null;
  return (customer as Stripe.Customer).metadata?.supabaseUserId ?? null;
}

async function setUserTier(userId: string, tier: string, extra?: Record<string, string>) {
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: { tier, ...extra },
  });
  if (error) console.error("Supabase update failed:", error.message);
  else console.log(`User ${userId} → tier:${tier}`);
}

export const handler = async (event: any) => {
  const sig = event.headers["stripe-signature"];
  if (!sig) return { statusCode: 400, body: "Missing Stripe signature" };

  let stripeEvent: Stripe.Event;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  try {
    switch (stripeEvent.type) {
      // ── New subscription created via Checkout or Payment Link ────────────
      case "checkout.session.completed": {
        const session = stripeEvent.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription") break;

        // userId can arrive via three paths in priority order:
        //  1. Payment Link query param → session.client_reference_id  ← Phase 2 (Payment Links)
        //  2. Checkout Session create call → subscription_data.metadata.supabaseUserId
        //  3. Pre-existing customer with supabaseUserId in its metadata
        const userId = session.client_reference_id
          ?? session.subscription_data?.metadata?.supabaseUserId
          ?? await supabaseUserIdFromCustomer(session.customer as string);
        if (!userId) { console.warn("No supabaseUserId on session", session.id); break; }

        const sub = await stripe.subscriptions.retrieve(session.subscription as string);
        const priceId = sub.items.data[0].price.id;
        const tier = priceIdToTier(priceId);

        // Persist supabaseUserId onto the Stripe customer so later
        // customer.subscription.* events can resolve the user without
        // relying on session.client_reference_id (which only fires once).
        if (session.customer) {
          try {
            await stripe.customers.update(session.customer as string, {
              metadata: { supabaseUserId: userId },
            });
          } catch (e: any) {
            console.error("Failed to backfill customer metadata:", e?.message);
          }
        }

        await setUserTier(userId, tier, {
          stripeCustomerId:     session.customer as string,
          stripeSubscriptionId: session.subscription as string,
        });
        break;
      }

      // ── Plan change / renewal ─────────────────────────────────────────────
      case "customer.subscription.updated": {
        const sub = stripeEvent.data.object as Stripe.Subscription;
        const userId = sub.metadata?.supabaseUserId
          ?? await supabaseUserIdFromCustomer(sub.customer as string);
        if (!userId) { console.warn("No supabaseUserId on subscription", sub.id); break; }

        const priceId = sub.items.data[0].price.id;
        // If this sub is no longer active, fall back to any other active sub
        // on the customer rather than blindly downgrading to free.
        const tier = sub.status === "active"
          ? priceIdToTier(priceId)
          : await activeTierForCustomer(sub.customer as string, sub.id);
        await setUserTier(userId, tier);
        break;
      }

      // ── Cancellation / payment failure ───────────────────────────────────
      case "customer.subscription.deleted": {
        const sub = stripeEvent.data.object as Stripe.Subscription;
        const userId = sub.metadata?.supabaseUserId
          ?? await supabaseUserIdFromCustomer(sub.customer as string);
        if (!userId) { console.warn("No supabaseUserId on deleted subscription", sub.id); break; }

        // Only downgrade to free if the customer has no other active sub.
        const tier = await activeTierForCustomer(sub.customer as string, sub.id);
        await setUserTier(userId, tier);
        break;
      }

      default:
        // Unhandled events — ignore silently
        break;
    }
  } catch (err: any) {
    console.error("Webhook handler error:", err?.message);
    return { statusCode: 500, body: "Internal error" };
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};

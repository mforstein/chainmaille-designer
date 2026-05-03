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
      // ── New subscription created via Checkout ────────────────────────────
      case "checkout.session.completed": {
        const session = stripeEvent.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription") break;

        const userId = session.subscription_data?.metadata?.supabaseUserId
          ?? await supabaseUserIdFromCustomer(session.customer as string);
        if (!userId) { console.warn("No supabaseUserId on session", session.id); break; }

        const sub = await stripe.subscriptions.retrieve(session.subscription as string);
        const priceId = sub.items.data[0].price.id;
        const tier = priceIdToTier(priceId);

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
        const tier = sub.status === "active" ? priceIdToTier(priceId) : "free";
        await setUserTier(userId, tier);
        break;
      }

      // ── Cancellation / payment failure ───────────────────────────────────
      case "customer.subscription.deleted": {
        const sub = stripeEvent.data.object as Stripe.Subscription;
        const userId = sub.metadata?.supabaseUserId
          ?? await supabaseUserIdFromCustomer(sub.customer as string);
        if (!userId) { console.warn("No supabaseUserId on deleted subscription", sub.id); break; }

        await setUserTier(userId, "free");
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

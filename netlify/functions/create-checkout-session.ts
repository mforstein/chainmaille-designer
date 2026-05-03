// netlify/functions/create-checkout-session.ts
// Creates a Stripe Checkout session for a subscription upgrade.
// Called from the PricingPage when a user clicks "Subscribe".

import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-04-30.basil",
});

const PRICE_TO_TIER: Record<string, string> = {
  [process.env.VITE_STRIPE_PRICE_MAKER ?? ""]:   "maker",
  [process.env.VITE_STRIPE_PRICE_CRAFTER ?? ""]: "crafter",
  [process.env.VITE_STRIPE_PRICE_STUDIO ?? ""]:  "studio",
};

export const handler = async (event: any) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let body: { priceId: string; userId: string; userEmail: string };
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { priceId, userId, userEmail } = body;
  if (!priceId || !userId || !userEmail) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing priceId, userId, or userEmail" }) };
  }

  if (!PRICE_TO_TIER[priceId]) {
    return { statusCode: 400, body: JSON.stringify({ error: "Unknown priceId" }) };
  }

  const siteUrl = process.env.URL ?? "http://localhost:8888";

  try {
    // Re-use an existing Stripe customer for this email, or create one.
    const existing = await stripe.customers.list({ email: userEmail, limit: 1 });
    let customerId: string;

    if (existing.data.length > 0) {
      customerId = existing.data[0].id;
      // Backfill supabaseUserId in metadata if missing
      if (!existing.data[0].metadata.supabaseUserId) {
        await stripe.customers.update(customerId, {
          metadata: { supabaseUserId: userId },
        });
      }
    } else {
      const customer = await stripe.customers.create({
        email: userEmail,
        metadata: { supabaseUserId: userId },
      });
      customerId = customer.id;
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${siteUrl}/pricing?success=1`,
      cancel_url:  `${siteUrl}/pricing?cancelled=1`,
      allow_promotion_codes: true,
      subscription_data: {
        metadata: { supabaseUserId: userId },
      },
    });

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err: any) {
    console.error("create-checkout-session error:", err?.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err?.message ?? "Stripe error" }),
    };
  }
};

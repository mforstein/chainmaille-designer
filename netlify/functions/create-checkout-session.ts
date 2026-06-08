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

// Stripe Connect 90/10 revenue split (optional / inert until configured).
// When STRIPE_CONNECTED_ACCOUNT_ID is set, this platform account keeps
// STRIPE_PLATFORM_FEE_PERCENT (default 10) as the application fee and routes the
// remainder (90%) to the connected account. Absent => normal single-account
// checkout, unchanged. Set both ONLY in live env once the connected account is
// onboarded; never commit the id.
const CONNECTED_ACCOUNT_ID = process.env.STRIPE_CONNECTED_ACCOUNT_ID ?? "";
const PLATFORM_FEE_PERCENT = Number(process.env.STRIPE_PLATFORM_FEE_PERCENT ?? "10");

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
        // 90/10 split: platform keeps PLATFORM_FEE_PERCENT, the rest transfers
        // to the connected account. Only applied when configured.
        ...(CONNECTED_ACCOUNT_ID && Number.isFinite(PLATFORM_FEE_PERCENT)
          ? {
              application_fee_percent: PLATFORM_FEE_PERCENT,
              transfer_data: { destination: CONNECTED_ACCOUNT_ID },
            }
          : {}),
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

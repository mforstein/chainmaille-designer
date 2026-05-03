// netlify/functions/create-portal-session.ts
// Creates a Stripe Customer Portal session so users can manage their subscription
// (cancel, change plan, update card) without us building that UI.

import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-04-30.basil",
});

export const handler = async (event: any) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let body: { stripeCustomerId: string };
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { stripeCustomerId } = body;
  if (!stripeCustomerId) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing stripeCustomerId" }) };
  }

  const siteUrl = process.env.URL ?? "http://localhost:8888";

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${siteUrl}/pricing`,
    });

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err: any) {
    console.error("create-portal-session error:", err?.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err?.message ?? "Stripe error" }),
    };
  }
};

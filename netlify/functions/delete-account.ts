// netlify/functions/delete-account.ts
// In-app account deletion (App Store Guideline 5.1.1(v) / Google Play).
//
// The client sends its Supabase access token in the Authorization header. We
// validate it, then — using the service-role key — delete that user's data and
// their auth account. A user can therefore only ever delete THEIR OWN account
// (the id comes from the verified token, never from the request body).
//
// Required Netlify env vars (already set; same as the webhooks):
//   VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// The native app (origin capacitor:// or https://localhost) calls this
// cross-origin, and the Authorization header triggers a CORS preflight. Allowing
// "*" is safe here: nothing happens without a valid bearer token, and a user can
// only delete their OWN account.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
};
const json = (statusCode: number, obj: unknown) => ({
  statusCode,
  headers: { ...CORS, "content-type": "application/json" },
  body: JSON.stringify(obj),
});

export const handler = async (event: any) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: CORS, body: "Method Not Allowed" };
  }

  // Bearer token = the caller's Supabase session JWT.
  const auth = event.headers?.authorization ?? event.headers?.Authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return json(401, { error: "Missing auth token" });

  try {
    // Validate the token → get the user it belongs to.
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    const user = userData?.user;
    if (userErr || !user) return json(401, { error: "Invalid or expired session" });

    // Delete the user's data first (best-effort), then the account itself.
    await supabaseAdmin.from("analytics_events").delete().eq("user_id", user.id);

    const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(user.id);
    if (delErr) {
      console.error("delete-account: deleteUser failed:", delErr.message);
      return json(500, { error: "Could not delete account" });
    }

    return json(200, { ok: true });
  } catch (err: any) {
    console.error("delete-account error:", err?.message);
    return json(500, { error: err?.message ?? "Server error" });
  }
};

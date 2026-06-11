// netlify/edge-functions/gate.ts
// Temporary site-wide password gate ("private preview" lock) so only people
// with the password can view chainmaildesigner.com while Erin reviews it.
//
// Controlled entirely by the SITE_LOCK_PASSWORD env var:
//   - set    → site requires HTTP Basic Auth (any username, that password)
//   - unset  → gate is a no-op (site is public again)
// So removing the lock = unset SITE_LOCK_PASSWORD in Netlify + redeploy.
//
// The Stripe webhook and other serverless functions are excluded via
// `excludedPath` in netlify.toml, so Stripe (which sends no credentials)
// still reaches /.netlify/functions/stripe-webhook.

export default async (request: Request, context: { next: () => Promise<Response> }) => {
  const expected = Netlify.env.get("SITE_LOCK_PASSWORD");

  // Fail open: if no password is configured, never lock the site (prevents
  // accidentally bricking access if the env var is missing).
  if (!expected) return context.next();

  const header = request.headers.get("authorization") || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    let decoded = "";
    try { decoded = atob(encoded); } catch { decoded = ""; }
    const sep = decoded.indexOf(":");
    const pass = sep >= 0 ? decoded.slice(sep + 1) : "";
    // Username is ignored on purpose — only the password matters, so Erin can
    // type anything in the username field.
    if (pass === expected) return context.next();
  }

  return new Response("This site is in private preview.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Chainmail Studio private preview"',
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
};

export const config = { path: "/*" };

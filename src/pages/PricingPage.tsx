// src/pages/PricingPage.tsx
import React, { useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useAuth, tierAtLeast } from "../auth/AuthContext";
import type { Tier } from "../auth/AuthContext";

// ── Plan definitions ──────────────────────────────────────────────────────────

interface Plan {
  tier: Tier;
  name: string;
  price: string;
  period: string;
  tagline: string;
  color: string;
  priceEnvKey: string;
  features: string[];
  cta: string;
}

const PLANS: Plan[] = [
  {
    tier: "free",
    name: "Free",
    price: "$0",
    period: "forever",
    tagline: "Explore the tools",
    color: "#374151",
    priceEnvKey: "",
    features: [
      "Ring Size Chart & AR calculator",
      "Weave Atlas — browse presets",
      "Weave Tuner — live 3D preview",
      "Basic 2D grid pattern designer",
      "Mobile app access",
    ],
    cta: "Get Started Free",
  },
  {
    tier: "maker",
    name: "Maker",
    price: "$4",
    period: "/ month",
    tagline: "Build for yourself",
    color: "#0369a1",
    priceEnvKey: import.meta.env.VITE_STRIPE_PRICE_MAKER ?? "",
    features: [
      "Everything in Free",
      "Weave Atlas — apply presets to 3D Designer",
      "Weave Tuner — save & load named weaves",
      "3D Ring Grid Designer",
      "Export CSV ring list",
    ],
    cta: "Start Maker",
  },
  {
    tier: "crafter",
    name: "Crafter",
    price: "$9",
    period: "/ month",
    tagline: "Sell at markets & online",
    color: "#7c3aed",
    priceEnvKey: import.meta.env.VITE_STRIPE_PRICE_CRAFTER ?? "",
    features: [
      "Everything in Maker",
      "3D Designer — spline fill & flood fill",
      "Export PDF bill of materials",
      "Physical pattern PDF (1:1 print tiles)",
      "Affiliate supplier buy buttons",
    ],
    cta: "Start Crafter",
  },
  {
    tier: "studio",
    name: "Studio",
    price: "$17.50",
    period: "/ month",
    tagline: "Full-time makers & shops",
    color: "#b45309",
    priceEnvKey: import.meta.env.VITE_STRIPE_PRICE_STUDIO ?? "",
    features: [
      "Everything in Crafter",
      "Freeform 2D Designer — full ring & scale placement",
      "Reference image overlay & color transfer",
      "Shape fill & spline drawing tools",
      "Supplier cost estimator & catalog sync",
      "Commercial use license",
    ],
    cta: "Start Studio",
  },
];

// ── Styles ────────────────────────────────────────────────────────────────────

const page: React.CSSProperties = {
  minHeight: "100vh",
  background: "#0b0f1a",
  color: "#e5e7eb",
  fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  padding: "48px 20px 80px",
};

const heading: React.CSSProperties = {
  textAlign: "center",
  fontSize: 36,
  fontWeight: 900,
  marginBottom: 8,
  color: "#f9fafb",
};

const sub: React.CSSProperties = {
  textAlign: "center",
  color: "#6b7280",
  fontSize: 16,
  marginBottom: 48,
};

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
  gap: 20,
  maxWidth: 1060,
  margin: "0 auto",
};

// ── Pricing card ──────────────────────────────────────────────────────────────

function PlanCard({
  plan,
  isCurrent,
  onSubscribe,
  onPortal,
  busy,
  loggedIn,
}: {
  plan: Plan;
  isCurrent: boolean;
  onSubscribe: (plan: Plan) => void;
  onPortal: () => void;
  busy: boolean;
  loggedIn: boolean;
}) {
  const isPopular = plan.tier === "studio";

  return (
    <div
      style={{
        background: "#111827",
        border: `2px solid ${isCurrent ? plan.color : isPopular ? plan.color + "66" : "#1f2937"}`,
        borderRadius: 16,
        padding: "28px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 0,
        position: "relative",
        boxShadow: isCurrent ? `0 0 0 3px ${plan.color}44` : undefined,
      }}
    >
      {isPopular && !isCurrent && (
        <div
          style={{
            position: "absolute",
            top: -13,
            left: "50%",
            transform: "translateX(-50%)",
            background: plan.color,
            color: "#fff",
            fontSize: 11,
            fontWeight: 800,
            padding: "3px 12px",
            borderRadius: 20,
            letterSpacing: 0.5,
            textTransform: "uppercase",
          }}
        >
          Most popular
        </div>
      )}
      {isCurrent && (
        <div
          style={{
            position: "absolute",
            top: -13,
            left: "50%",
            transform: "translateX(-50%)",
            background: plan.color,
            color: "#fff",
            fontSize: 11,
            fontWeight: 800,
            padding: "3px 12px",
            borderRadius: 20,
            letterSpacing: 0.5,
            textTransform: "uppercase",
          }}
        >
          Current plan
        </div>
      )}

      {/* Tier name */}
      <div style={{ fontSize: 13, fontWeight: 700, color: plan.color, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
        {plan.name}
      </div>

      {/* Price */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 4 }}>
        <span style={{ fontSize: 40, fontWeight: 900, color: "#f9fafb" }}>{plan.price}</span>
        <span style={{ fontSize: 14, color: "#6b7280" }}>{plan.period}</span>
      </div>

      <div style={{ fontSize: 13, color: "#9ca3af", marginBottom: 20 }}>{plan.tagline}</div>

      {/* CTA */}
      {plan.tier === "free" ? (
        loggedIn ? (
          <div
            style={{
              padding: "10px",
              borderRadius: 10,
              border: "1px solid #374151",
              color: "#6b7280",
              fontSize: 14,
              fontWeight: 600,
              textAlign: "center",
              marginBottom: 20,
            }}
          >
            {isCurrent ? "✓ Your current plan" : "Free plan"}
          </div>
        ) : (
          <Link
            to="/auth"
            style={{
              display: "block",
              padding: "10px",
              borderRadius: 10,
              background: "#1f2937",
              color: "#e5e7eb",
              fontSize: 14,
              fontWeight: 700,
              textAlign: "center",
              textDecoration: "none",
              marginBottom: 20,
            }}
          >
            {plan.cta}
          </Link>
        )
      ) : isCurrent ? (
        <button
          onClick={onPortal}
          disabled={busy}
          style={{
            padding: "10px",
            borderRadius: 10,
            border: `1px solid ${plan.color}`,
            background: "transparent",
            color: plan.color,
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            marginBottom: 20,
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? "Opening…" : "Manage subscription"}
        </button>
      ) : (
        <button
          onClick={() => onSubscribe(plan)}
          disabled={busy || !loggedIn}
          style={{
            padding: "10px",
            borderRadius: 10,
            border: "none",
            background: loggedIn ? plan.color : "#1f2937",
            color: "#fff",
            fontSize: 14,
            fontWeight: 700,
            cursor: loggedIn ? "pointer" : "not-allowed",
            marginBottom: 20,
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? "Redirecting…" : !loggedIn ? "Sign in to subscribe" : plan.cta}
        </button>
      )}

      {/* Feature list */}
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {plan.features.map((f) => (
          <li key={f} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: "#d1d5db" }}>
            <span style={{ color: plan.color, flexShrink: 0, marginTop: 1 }}>✓</span>
            {f}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PricingPage() {
  const { user, tier } = useAuth();
  const [searchParams] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const success = searchParams.get("success") === "1";
  const cancelled = searchParams.get("cancelled") === "1";

  const stripeCustomerId = (user as any)?.user_metadata?.stripeCustomerId as string | undefined;

  const handleSubscribe = async (plan: Plan) => {
    if (!user || !plan.priceEnvKey) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/.netlify/functions/create-checkout-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          priceId: plan.priceEnvKey,
          userId: user.id,
          userEmail: user.email,
        }),
      });
      let data: any = {};
      try { data = await res.json(); } catch { /* empty body */ }
      if (data.url) {
        window.location.href = data.url;
      } else if (!res.ok) {
        setError(res.status === 404 ? "Checkout unavailable — visit the live site to subscribe." : (data.error ?? `Server error (${res.status})`));
        setBusy(false);
      } else {
        setError(data.error ?? "Something went wrong. Please try again.");
        setBusy(false);
      }
    } catch (e: any) {
      setError(e.message ?? "Network error");
      setBusy(false);
    }
  };

  const handlePortal = async () => {
    if (!stripeCustomerId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/.netlify/functions/create-portal-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stripeCustomerId }),
      });
      let data: any = {};
      try { data = await res.json(); } catch { /* empty body */ }
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error ?? "Could not open billing portal.");
        setBusy(false);
      }
    } catch (e: any) {
      setError(e.message ?? "Network error");
      setBusy(false);
    }
  };

  return (
    <div style={page}>
      {/* Nav */}
      <div style={{ maxWidth: 1060, margin: "0 auto 40px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Link to="/wovenrainbowsbyerin" style={{ color: "#6b7280", fontSize: 14, textDecoration: "none" }}>
          ← Woven Rainbows by Erin
        </Link>
        {user ? (
          <span style={{ color: "#6b7280", fontSize: 13 }}>
            Signed in as <strong style={{ color: "#e5e7eb" }}>{user.email}</strong>
            {" · "}
            <span style={{ color: "#a78bfa", fontWeight: 700 }}>{tier.charAt(0).toUpperCase() + tier.slice(1)} plan</span>
          </span>
        ) : (
          <Link to="/auth" style={{ color: "#6b7280", fontSize: 13, textDecoration: "none" }}>
            Sign in →
          </Link>
        )}
      </div>

      {/* Header */}
      <h1 style={heading}>Simple, honest pricing</h1>
      <p style={sub}>Start free. Upgrade when you're ready to make more.</p>

      {/* Success / cancelled banners */}
      {success && (
        <div style={{ maxWidth: 600, margin: "0 auto 28px", background: "#052e16", border: "1px solid #16a34a", borderRadius: 10, padding: "12px 18px", color: "#bbf7d0", textAlign: "center", fontSize: 14 }}>
          🎉 Subscription active — your account has been upgraded. Welcome!
        </div>
      )}
      {cancelled && (
        <div style={{ maxWidth: 600, margin: "0 auto 28px", background: "#1c1917", border: "1px solid #44403c", borderRadius: 10, padding: "12px 18px", color: "#d6d3d1", textAlign: "center", fontSize: 14 }}>
          Checkout cancelled — no charge was made. Your plan is unchanged.
        </div>
      )}
      {error && (
        <div style={{ maxWidth: 600, margin: "0 auto 28px", background: "#450a0a", border: "1px solid #dc2626", borderRadius: 10, padding: "12px 18px", color: "#fca5a5", textAlign: "center", fontSize: 14 }}>
          {error}
        </div>
      )}

      {/* Plan cards */}
      <div style={grid}>
        {PLANS.map((plan) => (
          <PlanCard
            key={plan.tier}
            plan={plan}
            isCurrent={tier === plan.tier}
            onSubscribe={handleSubscribe}
            onPortal={handlePortal}
            busy={busy}
            loggedIn={!!user}
          />
        ))}
      </div>

      {/* Footer notes */}
      <div style={{ maxWidth: 700, margin: "48px auto 0", textAlign: "center", color: "#4b5563", fontSize: 13, lineHeight: 1.7 }}>
        <p>All plans include mobile app access. Cancel any time — no lock-in.</p>
        <p>Existing ERIN50 password users receive a complimentary 90-day Studio trial on first sign-up.</p>
        <p>
          Questions?{" "}
          <a href="mailto:micahforstein@gmail.com" style={{ color: "#7c3aed" }}>
            Contact us
          </a>
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 16 }}>
          <a
            href="/eula"
            style={{ color: "#6b7280", textDecoration: "underline", fontSize: 12 }}
          >
            End User License Agreement
          </a>
          <span style={{ color: "#374151" }}>·</span>
          <a
            href="/commercial-license"
            style={{ color: "#b45309", textDecoration: "underline", fontSize: 12 }}
          >
            Commercial Use License (Studio)
          </a>
        </div>
      </div>
    </div>
  );
}

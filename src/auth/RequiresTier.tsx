import React, { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth, tierAtLeast } from "./AuthContext";
import type { Tier } from "./AuthContext";
import { track } from "../lib/analytics";
import { HIDE_STORE_PURCHASE_UI } from "../lib/native";
import { usePaywall } from "../components/NativePaywall";

const TIER_LABELS: Record<Tier, string> = {
  free: "Free",
  maker: "Maker",
  crafter: "Crafter",
  studio: "Studio",
};

// Per Erin (2026-05-31): top tier capped at $10/mo, lower tiers
// scaled proportionally below. Free tier may eventually carry
// optional advertising via a service — decision pending; no ads in v1.
const TIER_PRICE: Record<Tier, string> = {
  free: "Free",
  maker: "$2.99/mo",
  crafter: "$5.99/mo",
  studio: "$9.99/mo",
};

interface RequiresTierProps {
  minTier: Tier;
  children: React.ReactNode;
  /** If true, renders a locked overlay instead of redirecting */
  inline?: boolean;
  featureName?: string;
}

export default function RequiresTier({
  minTier,
  children,
  inline = false,
  featureName,
}: RequiresTierProps) {
  const { tier, loading, user } = useAuth();
  const { openPaywall, available: iapPaywall } = usePaywall();
  const location = useLocation();
  const denied = !loading && !tierAtLeast(tier, minTier);

  // Funnel signal: how often a paywall is shown, for which feature, to whom.
  useEffect(() => {
    if (denied) {
      track("paywall_view", {
        feature: featureName ?? null,
        min_tier: minTier,
        current_tier: tier,
        mode: inline ? "inline" : "page",
        path: location.pathname,
      });
    }
  }, [denied, featureName, minTier, tier, inline, location.pathname]);

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0F1115",
          color: "#9ca3af",
        }}
      >
        Loading…
      </div>
    );
  }

  const hasAccess = tierAtLeast(tier, minTier);

  if (hasAccess) return <>{children}</>;

  // ── Inline locked overlay (for feature-level gating inside a page) ──────
  if (inline) {
    return (
      <div style={{ position: "relative", display: "inline-block" }}>
        <div style={{ opacity: 0.35, pointerEvents: "none" }}>{children}</div>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(15,17,21,0.75)",
            borderRadius: 10,
            padding: "12px 16px",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 20 }}>🔒</span>
          <span style={{ color: "#f9fafb", fontWeight: 700, fontSize: 13, textAlign: "center" }}>
            {featureName ?? "This feature"} requires {TIER_LABELS[minTier]}
          </span>
          {HIDE_STORE_PURCHASE_UI && iapPaywall ? (
            <button
              type="button"
              onClick={() => {
                track("upgrade_click", { feature: featureName ?? null, min_tier: minTier, current_tier: tier, mode: "inline" });
                openPaywall();
              }}
              style={{ padding: "6px 14px", background: "#7c3aed", color: "white", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
            >
              Unlock {TIER_LABELS[minTier]}
            </button>
          ) : HIDE_STORE_PURCHASE_UI ? (
            <span style={{ color: "#9ca3af", fontSize: 12, textAlign: "center" }}>
              Available with a subscribed account.
            </span>
          ) : (
            <a
              href="/pricing"
              onClick={() =>
                track("upgrade_click", {
                  feature: featureName ?? null,
                  min_tier: minTier,
                  current_tier: tier,
                  mode: "inline",
                })
              }
              style={{
                padding: "6px 14px",
                background: "#7c3aed",
                color: "white",
                borderRadius: 7,
                fontSize: 12,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              Upgrade — {TIER_PRICE[minTier]}
            </a>
          )}
        </div>
      </div>
    );
  }

  // ── Full-page redirect ────────────────────────────────────────────────────
  if (!user) {
    return (
      <Navigate
        to="/auth"
        state={{ redirect: location.pathname, minTier }}
        replace
      />
    );
  }

  // Logged in but wrong tier — show upgrade page
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#0F1115",
        color: "#e5e7eb",
        padding: 32,
        gap: 16,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 48 }}>🔒</div>
      <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>
        {TIER_LABELS[minTier]} tier required
      </h2>
      {HIDE_STORE_PURCHASE_UI && iapPaywall ? (
        <>
          <p style={{ color: "#9ca3af", maxWidth: 380, margin: 0 }}>
            {featureName ?? "This page"} is available on the{" "}
            <strong style={{ color: "#f9fafb" }}>{TIER_LABELS[minTier]}</strong> plan
            and above. Your current plan is{" "}
            <strong style={{ color: "#f9fafb" }}>{TIER_LABELS[tier]}</strong>.
          </p>
          <button
            type="button"
            onClick={() => {
              track("upgrade_click", { feature: featureName ?? null, min_tier: minTier, current_tier: tier, mode: "page" });
              openPaywall();
            }}
            style={{ marginTop: 8, padding: "12px 28px", background: "#7c3aed", color: "white", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: "pointer" }}
          >
            Unlock {TIER_LABELS[minTier]}
          </button>
        </>
      ) : HIDE_STORE_PURCHASE_UI ? (
        <p style={{ color: "#9ca3af", maxWidth: 380, margin: 0 }}>
          {featureName ?? "This page"} is available on the{" "}
          <strong style={{ color: "#f9fafb" }}>{TIER_LABELS[minTier]}</strong> plan
          and above. Your current plan is{" "}
          <strong style={{ color: "#f9fafb" }}>{TIER_LABELS[tier]}</strong>. Sign in
          with a subscribed account to unlock it.
        </p>
      ) : (
        <>
          <p style={{ color: "#9ca3af", maxWidth: 380, margin: 0 }}>
            {featureName ?? "This page"} is available on the{" "}
            <strong style={{ color: "#f9fafb" }}>{TIER_LABELS[minTier]}</strong> plan
            ({TIER_PRICE[minTier]}) and above. Your current plan is{" "}
            <strong style={{ color: "#f9fafb" }}>{TIER_LABELS[tier]}</strong>.
          </p>
          <a
            href="/pricing"
            onClick={() =>
              track("upgrade_click", {
                feature: featureName ?? null,
                min_tier: minTier,
                current_tier: tier,
                mode: "page",
              })
            }
            style={{
              marginTop: 8,
              padding: "12px 28px",
              background: "#7c3aed",
              color: "white",
              borderRadius: 10,
              fontWeight: 700,
              fontSize: 15,
              textDecoration: "none",
            }}
          >
            Upgrade to {TIER_LABELS[minTier]} — {TIER_PRICE[minTier]}
          </a>
        </>
      )}
      <a
        href="/wovenrainbowsbyerin"
        style={{ color: "#6b7280", fontSize: 13, textDecoration: "none" }}
      >
        ← Back to home
      </a>
    </div>
  );
}

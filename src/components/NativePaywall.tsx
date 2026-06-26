// ======================================================
// src/components/NativePaywall.tsx
// Native In-App Purchase paywall (iOS/Android via RevenueCat).
//
// On native the app must sell subscriptions through the store (Apple IAP /
// Play Billing) — see [[ios-store-compliance]]. This modal lists the offering
// packages with the store's localized prices and buys via RevenueCat.
//
// `PaywallProvider` wraps the app; any component calls `usePaywall().openPaywall()`
// to show it (a no-op on web, where the Stripe /pricing flow is used instead).
// ======================================================

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { iapAvailable, getPackages, purchase, restore, type IapPackage } from "../lib/iap";

interface PaywallCtx {
  openPaywall: () => void;
  available: boolean;
}
const Ctx = createContext<PaywallCtx>({ openPaywall: () => {}, available: false });
export const usePaywall = () => useContext(Ctx);

export function PaywallProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const available = iapAvailable();
  const openPaywall = useCallback(() => {
    if (available) setOpen(true);
  }, [available]);

  return (
    <Ctx.Provider value={{ openPaywall, available }}>
      {children}
      {open && <PaywallModal onClose={() => setOpen(false)} />}
    </Ctx.Provider>
  );
}

const TIER_BLURB: Record<string, string> = {
  maker: "3D Designer, Tuner save, CSV export",
  crafter: "Everything in Maker + image overlay, PDF BOM & pattern",
  studio: "Everything + Freeform, GLB/STL export, commercial license",
};

function PaywallModal({ onClose }: { onClose: () => void }) {
  const { refreshIapTier } = useAuth();
  const navigate = useNavigate();
  // Open a legal page (EULA / Privacy). Apple requires functional links to both
  // inside the subscription purchase flow (Guideline 3.1.2(c)). We close the
  // paywall and route to the in-app page so the content is always reachable,
  // even offline (it ships in the app bundle).
  const goLegal = (path: string) => { onClose(); navigate(path); };
  const [pkgs, setPkgs] = useState<IapPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPackages()
      .then((p) => { if (!cancelled) setPkgs(p); })
      .catch(() => { if (!cancelled) setError("Couldn't load plans. Please try again."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const buy = async (p: IapPackage) => {
    setBusy(true);
    setError(null);
    try {
      const tier = await purchase(p);
      if (tier) {
        await refreshIapTier();
        onClose();
      }
    } catch {
      setError("Purchase couldn't be completed.");
    } finally {
      setBusy(false);
    }
  };

  const doRestore = async () => {
    setBusy(true);
    setError(null);
    try {
      await restore();
      await refreshIapTier();
      onClose();
    } catch {
      setError("Nothing to restore, or restore failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 10000,
        background: "rgba(2,6,23,0.82)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 460,
          background: "#0b1324", color: "#e5e7eb",
          borderTopLeftRadius: 20, borderTopRightRadius: 20,
          padding: "20px 18px calc(24px + env(safe-area-inset-bottom))",
          boxShadow: "0 -8px 30px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Unlock more tools</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#94a3b8", fontSize: 22, cursor: "pointer" }}>✕</button>
        </div>
        <p style={{ margin: "0 0 14px", color: "#9ca3af", fontSize: 13 }}>
          Choose a plan. Billed through your {/* platform */}App Store / Google Play account; cancel anytime.
        </p>

        {loading && <div style={{ padding: 24, textAlign: "center", color: "#9ca3af" }}>Loading plans…</div>}

        {!loading && pkgs.length === 0 && (
          <div style={{ padding: 16, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
            Plans aren’t available right now. Please try again later.
          </div>
        )}

        {pkgs
          .slice()
          .sort((a, b) => (a.tier > b.tier ? 1 : -1))
          .map((p) => (
            <button
              key={p.id}
              disabled={busy}
              onClick={() => buy(p)}
              style={{
                width: "100%", textAlign: "left",
                background: "rgba(124,58,237,0.18)",
                border: "1px solid rgba(124,58,237,0.5)",
                borderRadius: 12, padding: "12px 14px", marginBottom: 10,
                color: "#e5e7eb", cursor: busy ? "default" : "pointer",
                opacity: busy ? 0.6 : 1,
                display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
              }}
            >
              <span>
                <span style={{ fontWeight: 800, fontSize: 15 }}>{p.title || p.tier}</span>
                <span style={{ display: "block", color: "#cbd5e1", fontSize: 11, marginTop: 2 }}>
                  {TIER_BLURB[p.tier] ?? ""}
                </span>
                <span style={{ display: "block", color: "#a5b4fc", fontSize: 11, marginTop: 4, fontWeight: 700 }}>
                  Monthly subscription · auto-renews
                </span>
              </span>
              <span style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                <span style={{ display: "block", fontWeight: 800, fontSize: 15 }}>{p.priceString}</span>
                <span style={{ display: "block", color: "#cbd5e1", fontSize: 11 }}>per month</span>
              </span>
            </button>
          ))}

        {error && <div style={{ color: "#f87171", fontSize: 12, marginTop: 4 }}>{error}</div>}

        <button
          disabled={busy}
          onClick={doRestore}
          style={{
            width: "100%", marginTop: 8, background: "none", border: "none",
            color: "#94a3b8", fontSize: 13, cursor: "pointer", textDecoration: "underline",
          }}
        >
          Restore purchases
        </button>

        {/* Required subscription disclosure + legal links (App Store 3.1.2(c) /
            Play). Length + price are shown per plan above. */}
        <p style={{ margin: "14px 0 8px", color: "#6b7280", fontSize: 11, lineHeight: 1.6 }}>
          Payment is charged to your App Store / Google Play account at confirmation.
          Subscriptions renew automatically for the same price and period unless canceled
          at least 24 hours before the end of the current period. Manage or cancel anytime
          in your account settings.
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: 18 }}>
          <button
            onClick={() => goLegal("/eula")}
            style={{ background: "none", border: "none", color: "#94a3b8", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}
          >
            Terms of Use (EULA)
          </button>
          <button
            onClick={() => goLegal("/privacy")}
            style={{ background: "none", border: "none", color: "#94a3b8", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}
          >
            Privacy Policy
          </button>
        </div>
      </div>
    </div>
  );
}

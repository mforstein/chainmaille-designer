import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import type { Tier } from "../auth/AuthContext";

type Mode = "signin" | "signup" | "forgot" | "reset" | "upgrade";

const TIER_FEATURES: Record<Tier, string[]> = {
  free: [
    "Ring Size Chart",
    "Weave Atlas (browse)",
    "Weave Tuner (preview)",
    "Basic 2D Rings",
  ],
  maker: [
    "Everything Free",
    "Weave Tuner (save/load)",
    "3D Designer (no image overlay)",
    "Export CSV",
  ],
  crafter: [
    "Everything Maker",
    "Freeform Designer (preview, default design)",
    "Export PDF + Physical Pattern",
  ],
  studio: [
    "Everything Crafter",
    "Full Freeform (image overlay & transfer)",
    "Supplier Cost Estimator",
    "Supplier Catalog Sync",
    "Commercial Use License",
  ],
};

const TIER_PRICE: Record<Tier, string> = {
  free: "Free",
  maker: "$8 / month",
  crafter: "$18 / month",
  studio: "$35 / month",
};

const fieldStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #374151",
  background: "#1F2937",
  color: "white",
  fontSize: 15,
  width: "100%",
  boxSizing: "border-box",
};

const btnPrimary: React.CSSProperties = {
  background: "#2563EB",
  border: "none",
  borderRadius: 8,
  color: "white",
  padding: "11px",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: 15,
  width: "100%",
};

export default function AuthPage() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { signIn, signUp, signOut, resetPassword, user, tier, loading } = useAuth();

  const initialMode = (searchParams.get("mode") as Mode) ?? "signin";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  const redirectTo =
    (location.state as { redirect?: string })?.redirect ?? "/workspace";

  // Already logged in and not upgrading — bounce straight through
  useEffect(() => {
    if (!loading && user && mode !== "upgrade") {
      navigate(redirectTo, { replace: true });
    }
  }, [user, loading, mode, navigate, redirectTo]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error: err } = await signIn(email, password);
    setBusy(false);
    if (err) { setError(err); return; }
    navigate(redirectTo, { replace: true });
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords do not match."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    setBusy(true);
    setError("");
    const { error: err } = await signUp(email, password);
    setBusy(false);
    if (err) { setError(err); return; }
    setInfo("Check your email to confirm your account, then sign in.");
    setMode("signin");
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error: err } = await resetPassword(email);
    setBusy(false);
    if (err) { setError(err); return; }
    setInfo("Password reset email sent — check your inbox.");
  }

  async function handleSignOut() {
    await signOut();
    navigate("/wovenrainbowsbyerin", { replace: true });
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0F1115", color: "#9ca3af" }}>
        Loading…
      </div>
    );
  }

  // ── Upgrade / pricing view ─────────────────────────────────────────────────
  if (mode === "upgrade") {
    const tiers: Tier[] = ["free", "maker", "crafter", "studio"];
    return (
      <div style={{ minHeight: "100vh", background: "#0F1115", color: "#e5e7eb", padding: "40px 20px" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <h1 style={{ textAlign: "center", fontWeight: 800, marginBottom: 8 }}>
            Woven Rainbows by Erin — Plans
          </h1>
          <p style={{ textAlign: "center", color: "#9ca3af", marginBottom: 32 }}>
            Choose the plan that fits your craft.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 16 }}>
            {tiers.map((t) => (
              <div
                key={t}
                style={{
                  background: t === "studio" ? "rgba(124,58,237,0.12)" : "rgba(31,41,55,0.6)",
                  border: `1px solid ${t === "studio" ? "#7c3aed" : "rgba(255,255,255,0.08)"}`,
                  borderRadius: 14,
                  padding: "20px 16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <div style={{ fontWeight: 800, fontSize: 17, textTransform: "capitalize" }}>{t}</div>
                <div style={{ color: "#a78bfa", fontWeight: 700, fontSize: 15 }}>{TIER_PRICE[t]}</div>
                <ul style={{ margin: 0, padding: "0 0 0 16px", color: "#9ca3af", fontSize: 12, lineHeight: 1.6 }}>
                  {TIER_FEATURES[t].map((f) => <li key={f}>{f}</li>)}
                </ul>
                {t !== "free" && (
                  <button
                    disabled
                    style={{
                      marginTop: "auto",
                      padding: "8px 0",
                      background: t === "studio" ? "#7c3aed" : "#1d4ed8",
                      border: "none",
                      borderRadius: 7,
                      color: "white",
                      fontWeight: 700,
                      cursor: "not-allowed",
                      opacity: 0.7,
                      fontSize: 13,
                    }}
                  >
                    Coming soon
                  </button>
                )}
              </div>
            ))}
          </div>
          <p style={{ textAlign: "center", color: "#6b7280", marginTop: 24, fontSize: 13 }}>
            Stripe billing coming soon. Existing beta users retain Studio access.
          </p>
          <div style={{ textAlign: "center", marginTop: 16 }}>
            {user ? (
              <button onClick={handleSignOut} style={{ color: "#6b7280", background: "none", border: "none", cursor: "pointer", fontSize: 13 }}>
                Sign out
              </button>
            ) : (
              <a href="/auth" style={{ color: "#6b7280", fontSize: 13, textDecoration: "none" }}>
                ← Sign in
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Auth card ──────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0F1115",
        color: "#E5E7EB",
        padding: 24,
      }}
    >
      <div style={{ width: "min(380px, 100%)" }}>
        <h1 style={{ textAlign: "center", marginBottom: 4, fontSize: 20, fontWeight: 800 }}>
          Woven Rainbows by Erin
        </h1>
        <p style={{ textAlign: "center", color: "#9CA3AF", marginBottom: 24, fontSize: 14 }}>
          {mode === "signin" && "Sign in to your account"}
          {mode === "signup" && "Create a free account"}
          {mode === "forgot" && "Reset your password"}
        </p>

        {/* Tab strip */}
        {mode !== "forgot" && (
          <div style={{ display: "flex", gap: 0, marginBottom: 20, borderRadius: 8, overflow: "hidden", border: "1px solid #374151" }}>
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(""); setInfo(""); }}
                style={{
                  flex: 1,
                  padding: "9px 0",
                  background: mode === m ? "#2563EB" : "#1F2937",
                  border: "none",
                  color: mode === m ? "white" : "#9CA3AF",
                  fontWeight: mode === m ? 700 : 400,
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                {m === "signin" ? "Sign In" : "Sign Up"}
              </button>
            ))}
          </div>
        )}

        {info && (
          <div style={{ background: "#064e3b", border: "1px solid #059669", borderRadius: 7, padding: "10px 12px", marginBottom: 14, fontSize: 13, color: "#6ee7b7" }}>
            {info}
          </div>
        )}
        {error && (
          <div style={{ background: "#450a0a", border: "1px solid #dc2626", borderRadius: 7, padding: "10px 12px", marginBottom: 14, fontSize: 13, color: "#fca5a5" }}>
            {error}
          </div>
        )}

        {/* Sign In */}
        {mode === "signin" && (
          <form onSubmit={handleSignIn} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={fieldStyle} />
            <input type="password" required placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} style={fieldStyle} />
            <button type="submit" disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }}>
              {busy ? "Signing in…" : "Sign In"}
            </button>
            <button type="button" onClick={() => { setMode("forgot"); setError(""); setInfo(""); }} style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 13 }}>
              Forgot password?
            </button>
          </form>
        )}

        {/* Sign Up */}
        {mode === "signup" && (
          <form onSubmit={handleSignUp} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={fieldStyle} />
            <input type="password" required placeholder="Password (8+ chars)" value={password} onChange={(e) => setPassword(e.target.value)} style={fieldStyle} />
            <input type="password" required placeholder="Confirm password" value={confirm} onChange={(e) => setConfirm(e.target.value)} style={fieldStyle} />
            <button type="submit" disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }}>
              {busy ? "Creating account…" : "Create Account"}
            </button>
            <p style={{ color: "#6b7280", fontSize: 12, textAlign: "center", margin: 0 }}>
              New accounts start on the Free plan.
            </p>
          </form>
        )}

        {/* Forgot */}
        {mode === "forgot" && (
          <form onSubmit={handleForgot} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input type="email" required placeholder="Your email" value={email} onChange={(e) => setEmail(e.target.value)} style={fieldStyle} />
            <button type="submit" disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }}>
              {busy ? "Sending…" : "Send Reset Email"}
            </button>
            <button type="button" onClick={() => { setMode("signin"); setError(""); setInfo(""); }} style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 13 }}>
              ← Back to sign in
            </button>
          </form>
        )}

        <div style={{ textAlign: "center", marginTop: 20 }}>
          <a href="/auth?mode=upgrade" style={{ color: "#6b7280", fontSize: 12, textDecoration: "none" }}>
            View plans & pricing
          </a>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams, useLocation, Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

type Mode = "signin" | "signup" | "forgot" | "reset" | "upgrade";

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
  const { signIn, signUp, resetPassword, updatePassword, user, loading } = useAuth();

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

  // Already logged in — bounce straight through, UNLESS:
  //   - mode is "upgrade" (canonical pricing page lives elsewhere)
  //   - mode is "reset" (Supabase issued a recovery session; user MUST stay
  //     on this page to set a new password before the session is useful)
  useEffect(() => {
    if (!loading && user && mode !== "upgrade" && mode !== "reset") {
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

  async function handleResetSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setBusy(true);
    const { error: err } = await updatePassword(password);
    setBusy(false);
    if (err) { setError(err); return; }
    setInfo("Password updated. Redirecting…");
    // Brief delay so the success message is visible, then go to workspace.
    setTimeout(() => navigate("/workspace", { replace: true }), 900);
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0F1115", color: "#9ca3af" }}>
        Loading…
      </div>
    );
  }

  // ── Upgrade view: canonical pricing UI lives at /pricing now ──────────────
  if (mode === "upgrade") {
    return <Navigate to="/pricing" replace />;
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
          {mode === "reset"  && "Set a new password"}
        </p>

        {/* Tab strip */}
        {mode !== "forgot" && mode !== "reset" && (
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

        {/* Reset (after clicking the email link) */}
        {mode === "reset" && (
          <form onSubmit={handleResetSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={{ color: "#9ca3af", fontSize: 13, margin: 0, textAlign: "center" }}>
              {user ? <>Signed in as <strong style={{ color: "#e5e7eb" }}>{user.email}</strong> via reset link.</> : "Loading your reset session…"}
            </p>
            <input type="password" required placeholder="New password (8+ chars)" value={password} onChange={(e) => setPassword(e.target.value)} style={fieldStyle} minLength={8} autoFocus />
            <input type="password" required placeholder="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} style={fieldStyle} minLength={8} />
            <button type="submit" disabled={busy || !user} style={{ ...btnPrimary, opacity: (busy || !user) ? 0.6 : 1 }}>
              {busy ? "Saving…" : "Set New Password"}
            </button>
            <button type="button" onClick={() => { setMode("signin"); setError(""); setInfo(""); setPassword(""); setConfirm(""); }} style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 13 }}>
              ← Cancel and sign in
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

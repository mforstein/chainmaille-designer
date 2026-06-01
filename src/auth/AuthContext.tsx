import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import type { User, Session } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";

// ─── Tier hierarchy ───────────────────────────────────────────────────────────
export type Tier = "free" | "maker" | "crafter" | "studio";

const TIER_RANK: Record<Tier, number> = {
  free: 0,
  maker: 1,
  crafter: 2,
  studio: 3,
};

export function tierAtLeast(userTier: Tier, required: Tier): boolean {
  return TIER_RANK[userTier] >= TIER_RANK[required];
}

// ─── Legacy sessionStorage bridge ────────────────────────────────────────────
// Existing ERIN50 users have designerAuth/freeformAuth/erin2DAuth set to "true".
// As of 2026-05-31 these flags live in sessionStorage instead of localStorage —
// they expire when the browser/tab is closed (closest thing to "logout" for a
// no-account flow). Existing localStorage flags are migrated to sessionStorage
// on first read for one-session continuity, then removed.
const LEGACY_FLAG_KEYS = ["designerAuth", "freeformAuth", "erin2DAuth"] as const;

function migrateLegacyFlagsFromLocalStorage() {
  try {
    for (const key of LEGACY_FLAG_KEYS) {
      const v = localStorage.getItem(key);
      if (v === "true" && !sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, "true");
      }
      localStorage.removeItem(key);
    }
  } catch {/* private mode / blocked storage */}
}

function legacyTier(): Tier | null {
  migrateLegacyFlagsFromLocalStorage();
  try {
    if (
      sessionStorage.getItem("designerAuth") === "true" &&
      sessionStorage.getItem("freeformAuth") === "true" &&
      sessionStorage.getItem("erin2DAuth") === "true"
    ) {
      return "studio";
    }
  } catch {/* private mode */}
  return null;
}

// ─── Developer tier override (dev / QA / testing backdoor) ───────────────────
// Activate by visiting any URL with:   ?devtier=<tier>&devkey=<DEV_TOKEN>
//   where <tier> is one of:  free | maker | crafter | studio
// As of 2026-05-31 the override is persisted in **sessionStorage** as
// `chainmail_dev_tier` — it survives navigations and reloads in the same tab,
// but is cleared when the browser/tab is closed or on explicit signOut.
// Beats every other tier source (Supabase metadata, ERIN50 legacy bridge).
//
// To deactivate:  visit any URL with  ?devtier=clear   (no token required)
//                 OR close the tab    (sessionStorage dies with it)
//                 OR in devtools:     sessionStorage.removeItem('chainmail_dev_tier')
//
// The token is only mild obscurity — keeps casual users from stumbling onto
// it, but anyone who reads the JS bundle can find it. Rotate by editing
// DEV_TIER_TOKEN below; that invalidates every existing dev URL.
const DEV_TIER_KEY = "chainmail_dev_tier";
const DEV_TIER_TOKEN = "erin-dev-2026";
const VALID_TIER_NAMES: readonly Tier[] = ["free", "maker", "crafter", "studio"] as const;

function devOverrideTier(): Tier | null {
  if (typeof window === "undefined") return null;
  try {
    // Migrate any pre-existing localStorage value once (same compat pattern as
    // legacyTier) so devs who already activated via the old persistent path
    // keep their override for one more browser session.
    const stale = localStorage.getItem(DEV_TIER_KEY);
    if (stale && !sessionStorage.getItem(DEV_TIER_KEY)) {
      sessionStorage.setItem(DEV_TIER_KEY, stale);
    }
    localStorage.removeItem(DEV_TIER_KEY);

    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("devtier");
    if (fromUrl !== null) {
      const lowered = fromUrl.toLowerCase();
      if (lowered === "clear") {
        sessionStorage.removeItem(DEV_TIER_KEY);
      } else if (
        params.get("devkey") === DEV_TIER_TOKEN &&
        (VALID_TIER_NAMES as readonly string[]).includes(lowered)
      ) {
        sessionStorage.setItem(DEV_TIER_KEY, lowered);
      }
    }
    const stored = sessionStorage.getItem(DEV_TIER_KEY);
    if (stored && (VALID_TIER_NAMES as readonly string[]).includes(stored)) {
      return stored as Tier;
    }
  } catch {
    // sessionStorage / window access denied (private mode, etc.) — silently no-op
  }
  return null;
}

// ─── Context shape ────────────────────────────────────────────────────────────
interface AuthContextValue {
  user: User | null;
  session: Session | null;
  tier: Tier;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  // Returns { error, needsEmailConfirm }. needsEmailConfirm=true when Supabase
  // didn't return a session on signup (= email confirmation is enabled in
  // project settings and the user must click an email link before signing in).
  signUp: (email: string, password: string) => Promise<{ error: string | null; needsEmailConfirm: boolean }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [tier, setTier] = useState<Tier>(() => devOverrideTier() ?? legacyTier() ?? "free");
  const [loading, setLoading] = useState(true);

  function tierFromUser(u: User | null): Tier {
    // Dev override beats all other tier sources (URL param + localStorage).
    const override = devOverrideTier();
    if (override) return override;
    if (!u) return legacyTier() ?? "free";
    const meta = u.user_metadata as { tier?: Tier } | undefined;
    return meta?.tier ?? "free";
  }

  useEffect(() => {
    if (!supabase) {
      // No Supabase configured — legacy mode only
      setLoading(false);
      return;
    }

    // On mount: pull cached session, then immediately refresh against Supabase
    // so we always have the latest user_metadata (e.g. Stripe-updated tier).
    // getSession is synchronous-feeling (uses the cached JWT) — that's what
    // unblocks initial render. refreshSession is the async truth-up call.
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setTier(tierFromUser(data.session?.user ?? null));
      setLoading(false);
      if (data.session && supabase) {
        supabase.auth.refreshSession().catch(() => { /* network blip — keep cached */ });
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        setTier(tierFromUser(newSession?.user ?? null));
      }
    );

    // Refresh the session whenever the tab becomes visible again. This picks
    // up any user_metadata changes (e.g. tier updates from the Stripe webhook
    // after the user returns from Stripe checkout) without forcing a manual
    // sign-out/sign-in. Cheap (one network call) and silent when nothing changed.
    const onVisibility = () => {
      if (document.visibilityState === "visible" && supabase) {
        supabase.auth.refreshSession().catch(() => { /* offline or token expired — ignore */ });
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      listener.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const signIn = useCallback(
    async (email: string, password: string): Promise<{ error: string | null }> => {
      if (!supabase) return { error: "Auth not configured" };
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error?.message ?? null };
    },
    []
  );

  const signUp = useCallback(
    async (email: string, password: string): Promise<{ error: string | null; needsEmailConfirm: boolean }> => {
      if (!supabase) return { error: "Auth not configured", needsEmailConfirm: false };
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { tier: "free" },
        },
      });
      // If Supabase returns a session, the user is already signed in →
      // email confirmation is disabled in project settings. Otherwise they
      // need to click the email link before they can sign in.
      const needsEmailConfirm = !error && !data?.session;
      return { error: error?.message ?? null, needsEmailConfirm };
    },
    []
  );

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    // Clear all backdoor flags (both old localStorage and new sessionStorage)
    // so signing out hard-resets to Free, no matter how the user got elevated.
    for (const key of LEGACY_FLAG_KEYS) {
      localStorage.removeItem(key);
      try { sessionStorage.removeItem(key); } catch { /* ignore */ }
    }
    localStorage.removeItem(DEV_TIER_KEY);
    try { sessionStorage.removeItem(DEV_TIER_KEY); } catch { /* ignore */ }
    setTier("free");
  }, []);

  const resetPassword = useCallback(
    async (email: string): Promise<{ error: string | null }> => {
      if (!supabase) return { error: "Auth not configured" };
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth?mode=reset`,
      });
      return { error: error?.message ?? null };
    },
    []
  );

  const updatePassword = useCallback(
    async (newPassword: string): Promise<{ error: string | null }> => {
      if (!supabase) return { error: "Auth not configured" };
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      return { error: error?.message ?? null };
    },
    []
  );

  return (
    <AuthContext.Provider
      value={{ user, session, tier, loading, signIn, signUp, signOut, resetPassword, updatePassword }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

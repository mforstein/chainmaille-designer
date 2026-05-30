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

// ─── Legacy localStorage bridge ──────────────────────────────────────────────
// Existing ERIN50 users have designerAuth/freeformAuth/erin2DAuth set to "true".
// Until they create a real account we treat them as Studio for the 90-day window.
function legacyTier(): Tier | null {
  if (
    localStorage.getItem("designerAuth") === "true" &&
    localStorage.getItem("freeformAuth") === "true" &&
    localStorage.getItem("erin2DAuth") === "true"
  ) {
    return "studio";
  }
  return null;
}

// ─── Developer tier override (dev / QA / testing backdoor) ───────────────────
// Activate by visiting any URL with:   ?devtier=<tier>&devkey=<DEV_TOKEN>
//   where <tier> is one of:  free | maker | crafter | studio
// Once activated the override is persisted in localStorage as `chainmail_dev_tier`
// and survives across navigations and sessions. Beats every other tier source
// (Supabase metadata, ERIN50 legacy bridge).
//
// To deactivate:  visit any URL with  ?devtier=clear   (no token required)
//                 OR in devtools:     localStorage.removeItem('chainmail_dev_tier')
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
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("devtier");
    if (fromUrl !== null) {
      const lowered = fromUrl.toLowerCase();
      if (lowered === "clear") {
        localStorage.removeItem(DEV_TIER_KEY);
      } else if (
        params.get("devkey") === DEV_TIER_TOKEN &&
        (VALID_TIER_NAMES as readonly string[]).includes(lowered)
      ) {
        localStorage.setItem(DEV_TIER_KEY, lowered);
      }
    }
    const stored = localStorage.getItem(DEV_TIER_KEY);
    if (stored && (VALID_TIER_NAMES as readonly string[]).includes(stored)) {
      return stored as Tier;
    }
  } catch {
    // localStorage / window access denied (private mode, etc.) — silently no-op
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
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
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

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setTier(tierFromUser(data.session?.user ?? null));
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        setTier(tierFromUser(newSession?.user ?? null));
      }
    );

    return () => listener.subscription.unsubscribe();
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
    async (email: string, password: string): Promise<{ error: string | null }> => {
      if (!supabase) return { error: "Auth not configured" };
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { tier: "free" },
        },
      });
      return { error: error?.message ?? null };
    },
    []
  );

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    // Clear legacy flags too
    localStorage.removeItem("designerAuth");
    localStorage.removeItem("freeformAuth");
    localStorage.removeItem("erin2DAuth");
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

  return (
    <AuthContext.Provider
      value={{ user, session, tier, loading, signIn, signUp, signOut, resetPassword }}
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

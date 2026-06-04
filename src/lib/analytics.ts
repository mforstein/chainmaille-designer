// src/lib/analytics.ts
// ─────────────────────────────────────────────────────────────────────────────
// First-party, privacy-friendly product analytics.
//
//   • Events go ONLY to our own Supabase database. No third-party trackers,
//     no advertising pixels, no Google Analytics — consistent with our
//     Privacy Policy promise.
//   • The only identifier we attach is the signed-in user's id (when signed
//     in) plus a random, resettable anonymous id. We do not collect names,
//     emails, IP addresses, or design contents here.
//   • Honors an explicit opt-out (Privacy Policy toggle) AND the browser's
//     Do-Not-Track signal.
//   • Best-effort by design: analytics must NEVER throw, block, or otherwise
//     affect the app. Every path is wrapped and failures are swallowed.
//
// Usage:
//   import { track } from "../lib/analytics";
//   track("export", { format: "pdf" });
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "../auth/supabaseClient";

const OPT_OUT_KEY = "chainmail_analytics_optout";
const ANON_ID_KEY = "chainmail_anon_id";
const SESSION_ID_KEY = "chainmail_session_id";

const FLUSH_DELAY_MS = 4000;
// Hard cap so a long offline stretch can never grow the queue unbounded.
const MAX_QUEUE = 50;

interface AnalyticsEvent {
  event: string;
  props: Record<string, unknown>;
  path: string | null;
  anon_id: string;
  session_id: string;
  user_id: string | null;
  tier: string;
  ts: string;
}

let identityUserId: string | null = null;
let identityTier = "free";
let queue: AnalyticsEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

// ── Consent / Do-Not-Track ──────────────────────────────────────────────────
function doNotTrack(): boolean {
  if (typeof navigator === "undefined" && typeof window === "undefined") return false;
  const nav = (typeof navigator !== "undefined" ? navigator : {}) as Record<string, unknown>;
  const win = (typeof window !== "undefined" ? window : {}) as Record<string, unknown>;
  const v = (nav.doNotTrack ?? win.doNotTrack ?? nav.msDoNotTrack) as string | undefined;
  return v === "1" || v === "yes";
}

export function analyticsOptedOut(): boolean {
  try {
    return localStorage.getItem(OPT_OUT_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAnalyticsOptOut(optOut: boolean): void {
  try {
    if (optOut) {
      localStorage.setItem(OPT_OUT_KEY, "1");
      queue = []; // drop anything pending immediately
    } else {
      localStorage.removeItem(OPT_OUT_KEY);
    }
  } catch {
    /* storage blocked (private mode) — nothing to persist */
  }
}

function enabled(): boolean {
  return !!supabase && !analyticsOptedOut() && !doNotTrack();
}

// ── Identifiers ───────────────────────────────────────────────────────────────
function uuid(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* fall through to manual */
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function anonId(): string {
  try {
    let id = localStorage.getItem(ANON_ID_KEY);
    if (!id) {
      id = uuid();
      localStorage.setItem(ANON_ID_KEY, id);
    }
    return id;
  } catch {
    return "anon";
  }
}

function sessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_ID_KEY);
    if (!id) {
      id = uuid();
      sessionStorage.setItem(SESSION_ID_KEY, id);
    }
    return id;
  } catch {
    return "session";
  }
}

/** Attach the current user id + tier to subsequent events. Called by AnalyticsTracker. */
export function setAnalyticsIdentity(opts: { userId: string | null; tier: string }): void {
  identityUserId = opts.userId;
  identityTier = opts.tier;
}

// ── Public API ────────────────────────────────────────────────────────────────
export function track(event: string, props: Record<string, unknown> = {}): void {
  if (!enabled()) return;
  try {
    queue.push({
      event,
      props,
      path: typeof location !== "undefined" ? location.pathname : null,
      anon_id: anonId(),
      session_id: sessionId(),
      user_id: identityUserId,
      tier: identityTier,
      ts: new Date().toISOString(),
    });
    if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
    scheduleFlush();
  } catch {
    /* never let analytics break a user action */
  }
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, FLUSH_DELAY_MS);
}

export async function flush(): Promise<void> {
  if (!enabled() || queue.length === 0) return;
  const batch = queue;
  queue = [];
  try {
    await supabase.from("analytics_events").insert(batch);
    // Best-effort: if insert errors we simply drop the batch rather than
    // retry-storm. Product analytics tolerate gaps; user experience does not
    // tolerate background retries hammering the network.
  } catch {
    /* swallow — offline, blocked, table missing, etc. */
  }
}

// ── Flush on the way out so we don't lose the last events of a session ────────
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    void flush();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flush();
  });
}

// src/components/AnalyticsTracker.tsx
// Headless component: keeps analytics identity in sync with auth and fires a
// `page_view` event on every route change. Mounted once at the app root.
import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { track, setAnalyticsIdentity } from "../lib/analytics";

export default function AnalyticsTracker() {
  const location = useLocation();
  const { user, tier } = useAuth();
  const lastPath = useRef<string | null>(null);

  // Keep user id + tier attached to events. Runs before the page_view effect
  // below, so the first view of a session already carries identity.
  useEffect(() => {
    setAnalyticsIdentity({ userId: user?.id ?? null, tier });
  }, [user?.id, tier]);

  useEffect(() => {
    if (lastPath.current === location.pathname) return;
    lastPath.current = location.pathname;
    track("page_view");
  }, [location.pathname]);

  return null;
}

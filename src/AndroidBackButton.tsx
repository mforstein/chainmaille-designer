// ======================================================
// src/AndroidBackButton.tsx
// Hardware/gesture back-button handling for the native app.
//
// Without a `backButton` listener, Capacitor's default is to EXIT the app on
// every back press. This routes back through React Router history instead, and
// only exits when there's nowhere left to go back to (at the app root).
//
// No-op on web/iOS — the `backButton` event simply never fires there.
// ======================================================

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { App as CapApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

export default function AndroidBackButton() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const handle = CapApp.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack || window.history.length > 1) {
        navigate(-1);
      } else {
        CapApp.exitApp();
      }
    });

    return () => {
      handle.then((h) => h.remove());
    };
  }, [navigate]);

  return null;
}

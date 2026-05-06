// src/hooks/useViewport.ts
// Reactive viewport dimensions + safe-area helpers.
// Components that use this re-render on resize/orientation-change.

import { useEffect, useState } from "react";

export interface Viewport {
  vw: number;
  vh: number;
  isMobile: boolean;   // vw < 768
  isNarrow: boolean;   // vw < 480  (most phones in portrait)
  safeTop: number;     // px — status-bar / notch clearance
  safeBottom: number;  // px — home-indicator clearance
}

function readViewport(): Viewport {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Read CSS env() safe areas if the browser supports them.
  // We inject a tiny probe element once and read its padding.
  const probe = _getProbe();
  const st = probe ? parseInt(getComputedStyle(probe).paddingTop,    10) || 0 : 0;
  const sb = probe ? parseInt(getComputedStyle(probe).paddingBottom, 10) || 0 : 0;

  return {
    vw, vh,
    isMobile: vw < 768,
    isNarrow: vw < 480,
    safeTop:    Math.max(st, 20),   // always at least 20px so controls clear status bars
    safeBottom: Math.max(sb, 8),
  };
}

let _probe: HTMLElement | null = null;
function _getProbe(): HTMLElement | null {
  if (_probe) return _probe;
  if (typeof document === "undefined") return null;
  const el = document.createElement("div");
  el.style.cssText = [
    "position:fixed", "top:0", "left:0", "width:0", "height:0", "pointer-events:none",
    "padding-top:env(safe-area-inset-top,0px)",
    "padding-bottom:env(safe-area-inset-bottom,0px)",
    "visibility:hidden",
  ].join(";");
  document.documentElement.appendChild(el);
  _probe = el;
  return el;
}

export function useViewport(): Viewport {
  const [vp, setVp] = useState<Viewport>(() => readViewport());

  useEffect(() => {
    const update = () => setVp(readViewport());
    window.addEventListener("resize",            update, { passive: true });
    window.addEventListener("orientationchange", update, { passive: true });
    // Some iOS Safari versions fire visualViewport resize instead
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", update);
    }
    return () => {
      window.removeEventListener("resize",            update);
      window.removeEventListener("orientationchange", update);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", update);
      }
    };
  }, []);

  return vp;
}

/** Clamp a panel's left-edge so it stays on screen. */
export function safeLeft(x: number, panelWidth: number, vw: number, margin = 8): number {
  return Math.max(margin, Math.min(x, vw - panelWidth - margin));
}

/** Clamp a panel's top-edge so it stays below the status bar and above the fold. */
export function safeTop(y: number, panelHeight: number, vh: number, topClear = 60, margin = 8): number {
  return Math.max(topClear, Math.min(y, vh - panelHeight - margin));
}

/** Responsive panel width: clamp to viewport minus margins. */
export function panelWidth(preferred: number, vw: number, margin = 24): number {
  return Math.min(preferred, vw - margin);
}

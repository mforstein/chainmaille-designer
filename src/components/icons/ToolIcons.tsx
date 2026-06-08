import React from "react";

export function IconHamburger({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ display: "block" }}>
      <line x1="4" y1="7"  x2="20" y2="7"  stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="4" y1="17" x2="20" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function IconSpline({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ display: "block" }}>
      {/* bezier S-curve */}
      <path d="M4 18 C4 12, 12 12, 12 12 C12 12, 20 12, 20 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      {/* anchor points */}
      <circle cx="4"  cy="18" r="2" fill="currentColor" />
      <circle cx="20" cy="6"  r="2" fill="currentColor" />
      {/* control handles */}
      <circle cx="4"  cy="12" r="1.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="20" cy="12" r="1.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <line x1="4"  y1="18" x2="4"  y2="12" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" />
      <line x1="20" y1="6"  x2="20" y2="12" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" />
    </svg>
  );
}

export function IconEraser({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ display: "block" }}>
      <path d="M20 20H9L4 15l10-10 7 7-1 1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.5 17.5L12 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function IconUndo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ display: "block" }}>
      <path d="M9 14L4 9l5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 9h10a5 5 0 0 1 0 10H9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function IconRedo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ display: "block" }}>
      <path d="M15 14l5-5-5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 9H10a5 5 0 0 0 0 10h6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function IconCircle({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      style={{ display: "block" }}
    >
      <circle
        cx="12"
        cy="12"
        r="8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

export function IconSquare({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      style={{ display: "block" }}
    >
      <rect
        x="6"
        y="6"
        width="12"
        height="12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

// 4-directional arrow — used for "drag scale plane" mode
export function IconMirror({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ display: "block" }}>
      {/* mirror axis (dashed) */}
      <line x1="12" y1="3" x2="12" y2="21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="2.5 2.5" />
      {/* left shape — solid */}
      <path d="M10 7L4 12l6 5z" fill="currentColor" />
      {/* right shape — hollow mirror image */}
      <path d="M14 7l6 5-6 5z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

// A jump ring (annulus) — used as the Rings-layer indicator.
export function IconRing({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ display: "block" }}>
      <circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth="2.4" />
    </svg>
  );
}

// A standard scale silhouette (pointed-oval / almond) with a ring hole near the
// top — used as the Scales-layer indicator instead of the old 💧 teardrop.
export function IconScale({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ display: "block" }}>
      <path
        d="M12 3 C16.5 8, 16.5 15.5, 12 21 C7.5 15.5, 7.5 8, 12 3 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="7" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

// A triangle with a 90° rotation arc — used for the Designer "Camera Tools".
export function IconRotate90({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ display: "block" }}>
      {/* the triangle */}
      <path d="M10 8.5 L16 12 L10 15.5 Z" fill="currentColor" />
      {/* 90° rotation arc (top-left quadrant) with an arrowhead */}
      <path d="M4 12 A 8 8 0 0 1 12 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 4 L9.4 3.4 M12 4 L11.3 6.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// A rectangle with a diagonal resize arrow — used for the Designer grid-size
// (columns/rows = width/height) menu.
export function IconGridResize({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ display: "block" }}>
      <rect x="4" y="4" width="16" height="16" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9 9 L15 15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M9 9 L9 12 M9 9 L12 9" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M15 15 L15 12 M15 15 L12 15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function IconScaleMove({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ display: "block" }}>
      {/* up */}
      <path d="M12 4l-2.5 3h5L12 4z" fill="currentColor" />
      <line x1="12" y1="4" x2="12" y2="10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      {/* down */}
      <path d="M12 20l2.5-3h-5L12 20z" fill="currentColor" />
      <line x1="12" y1="20" x2="12" y2="14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      {/* left */}
      <path d="M4 12l3-2.5v5L4 12z" fill="currentColor" />
      <line x1="4" y1="12" x2="10" y2="12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      {/* right */}
      <path d="M20 12l-3 2.5v-5L20 12z" fill="currentColor" />
      <line x1="20" y1="12" x2="14" y2="12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
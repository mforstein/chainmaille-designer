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
// src/components/PanArrows.tsx
//
// Touch-friendly Pan X / Pan Y stepper rows used by BOTH the Designer
// (ImageOverlayPanel) and Freeform image-overlay panels, so the two pages
// behave identically. Replaces the old Pan X/Y range sliders, which fired
// dozens of expensive re-samples per second (freezing on large ring counts)
// and were unusable by touch (no slider thumb to grab on iPad/iPhone).
//
// Each axis is a row:  Pan X  [◀]  23  [▶]     Pan Y  [▲]  0  [▼]
// Tap = one nudge; press-and-hold = auto-repeat. Convention (matches the
// drag handlers in both panels): right arrow = +offsetX, down arrow = +offsetY.
import React, { useCallback, useEffect, useRef } from "react";

interface PanArrowsProps {
  /** Current pan, in the same preview-pixel units the panels already store. */
  offsetX: number;
  offsetY: number;
  /**
   * Apply a delta. Parent wires this to a functional state update so
   * press-and-hold auto-repeat always sees the latest value (no stale closure).
   */
  onNudge: (dx: number, dy: number) => void;
  /** Reset both axes to 0. */
  onReset?: () => void;
  /** Pixels moved per tap / per auto-repeat tick. Default 5. */
  step?: number;
}

export const PanArrows: React.FC<PanArrowsProps> = ({
  offsetX,
  offsetY,
  onNudge,
  onReset,
  step = 5,
}) => {
  // Auto-repeat timer for press-and-hold. Held in a ref so it survives
  // re-renders and can be cleared from any handler / on unmount.
  const repeatRef = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (repeatRef.current !== null) {
      window.clearInterval(repeatRef.current);
      repeatRef.current = null;
    }
  }, []);

  // Clear any running interval if the component unmounts mid-hold.
  useEffect(() => stop, [stop]);

  const start = useCallback(
    (dx: number, dy: number) => {
      stop();
      onNudge(dx, dy); // immediate response to the tap
      // Short delay before auto-repeat kicks in feels intentional, not jumpy.
      repeatRef.current = window.setInterval(() => onNudge(dx, dy), 90);
    },
    [onNudge, stop],
  );

  const arrow = (label: string, dx: number, dy: number, title: string): React.ReactNode => (
    <button
      type="button"
      title={title}
      aria-label={title}
      // Pointer events cover mouse + touch + pen with one path; touchAction
      // none stops the press-and-hold from scrolling the panel on iPad/iPhone.
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        (e.currentTarget as HTMLButtonElement).setPointerCapture?.(e.pointerId);
        start(dx, dy);
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onPointerLeave={stop}
      onClick={(e) => e.stopPropagation()}
      style={btnStyle}
    >
      {label}
    </button>
  );

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <Row label="Pan X">
        {arrow("◀", -step, 0, "Pan left")}
        <span style={valStyle}>{Math.round(offsetX)}</span>
        {arrow("▶", step, 0, "Pan right")}
        {onReset && (
          <button
            type="button"
            title="Reset pan to center"
            aria-label="Reset pan to center"
            onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onClick={(e) => { e.stopPropagation(); onReset(); }}
            style={{ ...btnStyle, width: "auto", padding: "0 8px", fontSize: 12 }}
          >
            ⌖
          </button>
        )}
      </Row>
      <Row label="Pan Y">
        {arrow("▲", 0, -step, "Pan up")}
        <span style={valStyle}>{Math.round(offsetY)}</span>
        {arrow("▼", 0, step, "Pan down")}
      </Row>
    </div>
  );
};

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
    <span style={{ color: "#9ca3af", minWidth: 44 }}>{label}</span>
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>{children}</div>
  </div>
);

const btnStyle: React.CSSProperties = {
  width: 34,
  height: 30,
  background: "#1f2937",
  color: "#f3f4f6",
  border: "1px solid #374151",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 700,
  lineHeight: 1,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  userSelect: "none",
  touchAction: "none",
};

const valStyle: React.CSSProperties = {
  minWidth: 40,
  textAlign: "center",
  fontVariantNumeric: "tabular-nums",
  color: "#e5e7eb",
};

export default PanArrows;

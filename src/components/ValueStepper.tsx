// src/components/ValueStepper.tsx
//
// Single-value up/down arrow stepper. Replaces the range sliders in the
// Freeform image-overlay panel (Scale / Opacity / Rotation / Pattern Scale).
// Range sliders fired a continuous stream of onChange events while dragging,
// which re-sampled every ring per event and froze large designs; they also had
// no grabbable thumb on touch. A stepper emits one discrete change per tap, or
// auto-repeats on press-and-hold — smooth on iPad/iPhone and on big designs.
//
// Layout:  Label            [▼]  value  [▲]
//   ▼ = decrease, ▲ = increase.
import React, { useCallback, useEffect, useRef } from "react";

interface ValueStepperProps {
  label: string;
  value: number;
  /** Absolute new value. Clamped to [min, max] and rounded to `decimals`. */
  onChange: (next: number) => void;
  step: number;
  min: number;
  max: number;
  /** Decimal places to round/store + display. Default 0. */
  decimals?: number;
  /** Optional suffix shown after the value (e.g. "°", "%"). */
  suffix?: string;
  /** Render an editable number input between the arrows instead of static
   *  text, so the user can also type a value directly (handy for wide ranges
   *  like grid size where stepping one-by-one to 400 would be tedious). */
  editable?: boolean;
}

export const ValueStepper: React.FC<ValueStepperProps> = ({
  label,
  value,
  onChange,
  step,
  min,
  max,
  decimals = 0,
  suffix = "",
  editable = false,
}) => {
  // Latest value, mirrored to a ref so press-and-hold auto-repeat keeps
  // progressing without waiting on a re-render (no stale closure).
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const repeatRef = useRef<number | null>(null);
  const stop = useCallback(() => {
    if (repeatRef.current !== null) {
      window.clearInterval(repeatRef.current);
      repeatRef.current = null;
    }
  }, []);
  useEffect(() => stop, [stop]);

  const round = useCallback(
    (n: number) => {
      const f = Math.pow(10, decimals);
      return Math.round(n * f) / f;
    },
    [decimals],
  );

  const bump = useCallback(
    (dir: 1 | -1) => {
      const next = round(Math.max(min, Math.min(max, valueRef.current + dir * step)));
      if (next === valueRef.current) return;
      valueRef.current = next; // optimistic so consecutive ticks advance
      onChange(next);
    },
    [round, min, max, step, onChange],
  );

  const start = useCallback(
    (dir: 1 | -1) => {
      stop();
      bump(dir);
      repeatRef.current = window.setInterval(() => bump(dir), 90);
    },
    [bump, stop],
  );

  const arrow = (label: string, dir: 1 | -1, title: string): React.ReactNode => (
    <button
      type="button"
      title={title}
      aria-label={title}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        (e.currentTarget as HTMLButtonElement).setPointerCapture?.(e.pointerId);
        start(dir);
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
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ color: "#9ca3af", flex: 1 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {arrow("▼", -1, `Decrease ${label}`)}
        {editable ? (
          <input
            type="number"
            min={min}
            max={max}
            value={value}
            aria-label={label}
            onChange={(e) => {
              const raw = parseFloat(e.target.value);
              if (!Number.isFinite(raw)) return; // ignore mid-typing empties
              onChange(round(Math.max(min, Math.min(max, raw))));
            }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            style={inputStyle}
          />
        ) : (
          <span style={valStyle}>
            {value.toFixed(decimals)}
            {suffix}
          </span>
        )}
        {arrow("▲", 1, `Increase ${label}`)}
      </div>
    </div>
  );
};

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
  minWidth: 48,
  textAlign: "center",
  fontVariantNumeric: "tabular-nums",
  color: "#e5e7eb",
};

const inputStyle: React.CSSProperties = {
  width: 52,
  textAlign: "center",
  fontVariantNumeric: "tabular-nums",
  background: "#111827",
  color: "#fff",
  border: "1px solid #374151",
  borderRadius: 8,
  padding: "5px 4px",
  fontSize: 14,
};

export default ValueStepper;

// src/components/FloatingPanel.tsx
import React, { useEffect, useRef, useState } from "react";

interface FloatingPanelProps {
  isCameraPanel?: boolean; // true = camera, false = others
  paintMode: boolean;
  eraseMode: boolean;
  rotationLocked: boolean;
  onTogglePaint: () => void;
  onToggleErase: () => void;
  onToggleLock: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  onClearPaint: () => void; // 🧹 Clear all painted rings
}

/**
 * 📸 Floating draggable camera control panel
 * Smooth drag + paint toggle + erase toggle + reset view + clear paint
 */
export default function FloatingPanel({
  isCameraPanel = true,
  paintMode,
  eraseMode,
  rotationLocked,
  onTogglePaint,
  onToggleErase,
  onToggleLock,
  onZoomIn,
  onZoomOut,
  onResetView,
  onClearPaint,
}: FloatingPanelProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ x: 20, y: 20 });
  const [dragging, setDragging] = useState(false);
  const startRef = useRef({ x: 0, y: 0 });
  const offsetRef = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  // Start dragging
  const onMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDragging(true);
    startRef.current = { x: e.clientX, y: e.clientY };
    offsetRef.current = { x: pos.x, y: pos.y };
  };
  const onTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    const t = e.touches[0];
    setDragging(true);
    startRef.current = { x: t.clientX, y: t.clientY };
    offsetRef.current = { x: pos.x, y: pos.y };
  };

  // Move panel
  const handleMove = (clientX: number, clientY: number) => {
    const dx = clientX - startRef.current.x;
    const dy = clientY - startRef.current.y;
    setPos({
      x: offsetRef.current.x + dx,
      y: offsetRef.current.y + dy,
    });
  };
  const onMouseMove = (e: React.MouseEvent) =>
    dragging && handleMove(e.clientX, e.clientY);
  const onTouchMove = (e: React.TouchEvent) =>
    dragging && handleMove(e.touches[0].clientX, e.touches[0].clientY);
  const stopDrag = () => setDragging(false);

  // Keep in window
  useEffect(() => {
    const clampPosition = () => {
      const panel = panelRef.current;
      if (!panel) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const w = panel.offsetWidth;
      const h = panel.offsetHeight;
      setPos((p) => ({
        x: Math.min(Math.max(p.x, 8), vw - w - 8),
        y: Math.min(Math.max(p.y, 8), vh - h - 8),
      }));
    };
    clampPosition();
    window.addEventListener("resize", clampPosition);
    return () => window.removeEventListener("resize", clampPosition);
  }, []);

  const btnStyle: React.CSSProperties = {
    border: "none",
    outline: "none",
    background: "#222",
    color: "#fff",
    borderRadius: "8px",
    width: "34px",
    height: "34px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    fontSize: "18px",
    transition: "background 0.2s ease",
  };

  return (
    <div
      ref={panelRef}
      style={{
        position: "absolute",
        top: pos.y,
        left: pos.x,
        zIndex: 999,
        background: "rgba(0,0,0,0.85)",
        border: "1px solid #444",
        borderRadius: "12px",
        padding: open ? "10px" : "6px",
        display: "flex",
        flexDirection: open ? "column" : "row",
        alignItems: "center",
        gap: open ? 8 : 0,
        boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
        userSelect: "none",
        touchAction: "none",
      }}
      onMouseMove={onMouseMove}
      onMouseUp={stopDrag}
      onMouseLeave={stopDrag}
      onTouchMove={onTouchMove}
      onTouchEnd={stopDrag}
    >
      {/* 📸 Main toggle */}
      <div
        onClick={() => setOpen(!open)}
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        title={open ? "Close Controls" : "Open Controls"}
        style={{
          ...btnStyle,
          background: open ? "#3b82f6" : "#222",
        }}
      >
        📸
      </div>

      {open && (
        <>
          {/* Paint Mode */}
          <div
            onClick={onTogglePaint}
            title="Toggle Paint Mode"
            style={{
              ...btnStyle,
              background: paintMode ? "#16a34a" : "#222",
            }}
          >
            🎨
          </div>

          {/* Erase (only when painting) */}
          {paintMode && (
            <div
              onClick={onToggleErase}
              title="Erase Mode"
              style={{
                ...btnStyle,
                background: eraseMode ? "#eab308" : "#222",
              }}
            >
              🧽
            </div>
          )}

          {/* 🧹 Clear Paint */}
          <div
            onClick={onClearPaint}
            title="Clear All Paint"
            style={{
              ...btnStyle,
              background: "#9ca3af",
            }}
          >
            🧹
          </div>

          {/* 🔒 Lock */}
          <div
            onClick={onToggleLock}
            title={rotationLocked ? "Unlock Rotation" : "Lock Rotation"}
            style={{
              ...btnStyle,
              background: rotationLocked ? "#ef4444" : "#222",
            }}
          >
            {rotationLocked ? "🔒" : "🔓"}
          </div>

          {/* ➕ ➖ Zoom */}
          <div onClick={onZoomIn} title="Zoom In" style={btnStyle}>
            ➕
          </div>
          <div onClick={onZoomOut} title="Zoom Out" style={btnStyle}>
            ➖
          </div>

          {/* 🔄 Reset View */}
          <div
            onClick={onResetView}
            title="Reset Camera View"
            style={{
              ...btnStyle,
              background: "#555",
            }}
          >
            🔄
          </div>
        </>
      )}
    </div>
  );
}

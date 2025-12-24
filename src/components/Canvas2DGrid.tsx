// src/components/Canvas2DGrid.tsx
import React, { useEffect, useRef, useState } from "react";

const rows = 85;
const cols = 130;
const spacingX = 14;
const spacingY = 12;
const radius = 5;
const palette = ["#000", "#e11d48", "#10b981", "#3b82f6", "#f59e0b", "#fff"];

export default function Canvas2DGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [color, setColor] = useState(palette[1]);
  const [fps, setFps] = useState(0);
  const paintRef = useRef<Map<string, string>>(new Map());
  const isPaintingRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);
      drawGrid();
    };

    window.addEventListener("resize", resize);
    resize();

    function drawGrid() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const key = `${r},${c}`;
          ctx.beginPath();
          ctx.arc(
            c * spacingX + spacingX / 2,
            r * spacingY + spacingY / 2,
            radius,
            0,
            Math.PI * 2,
          );
          ctx.fillStyle = paintRef.current.get(key) || "#334155";
          ctx.fill();
        }
      }
    }

    function paintAt(x: number, y: number) {
      const c = Math.floor(x / spacingX);
      const r = Math.floor(y / spacingY);
      if (r < 0 || c < 0 || r >= rows || c >= cols) return;
      const key = `${r},${c}`;
      paintRef.current.set(key, color);
      drawGrid();
    }

    const handlePointerDown = (e: PointerEvent) => {
      isPaintingRef.current = true;
      const rect = canvas.getBoundingClientRect();
      paintAt(e.clientX - rect.left, e.clientY - rect.top);
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!isPaintingRef.current) return;
      const rect = canvas.getBoundingClientRect();
      paintAt(e.clientX - rect.left, e.clientY - rect.top);
    };

    const handlePointerUp = () => {
      isPaintingRef.current = false;
    };

    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    // FPS tracking
    let last = performance.now();
    let frames = 0;
    const loop = () => {
      frames++;
      const now = performance.now();
      if (now - last > 1000) {
        setFps(frames);
        frames = 0;
        last = now;
      }
      requestAnimationFrame(loop);
    };
    loop();

    return () => {
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [color]);

  return (
    <div
      style={{
        background: "#0f172a",
        width: "100vw",
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        color: "#fff",
      }}
    >
      <h2 style={{ marginBottom: 10 }}>🖌️ Canvas2D Grid Demo</h2>
      <div style={{ position: "relative" }}>
        <canvas
          ref={canvasRef}
          style={{
            width: "90vw",
            height: "80vh",
            background: "#0f172a",
            touchAction: "none", // ✅ Important for iPhone touch input
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 10,
            left: 10,
            color: "#fff",
          }}
        >
          FPS: {fps}
        </div>
      </div>
      <div style={{ marginTop: 8, display: "flex", gap: 4 }}>
        {palette.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            style={{
              width: 24,
              height: 24,
              background: c,
              border: color === c ? "2px solid #fff" : "1px solid #333",
            }}
          />
        ))}
      </div>
    </div>
  );
}

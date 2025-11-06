// src/components/PixiGrid.tsx
import React, { useEffect, useRef, useState } from "react";
import {
  Application,
  Container,
  Graphics,
  Sprite,
  Color,
  PointData,
  FederatedPointerEvent,
} from "pixi.js";

const rows = 85;
const cols = 130;
const spacingX = 14;
const spacingY = 12;
const radius = 5;
const palette = ["#000000", "#e11d48", "#10b981", "#3b82f6", "#f59e0b", "#ffffff"];

export default function PixiGrid() {
  const hostRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const spritesRef = useRef<Sprite[]>([]);
  const paintRef = useRef<Map<string, string>>(new Map());
  const isPaintingRef = useRef(false);
  const colorRef = useRef<string>(palette[1]);

  const [fps, setFps] = useState(0);
  const [color, setColor] = useState(palette[1]);

  // keep refs in sync
  useEffect(() => {
    colorRef.current = color;
  }, [color]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!hostRef.current) return;

      // Create app (v8 API)
      const app = new Application();
      await app.init({
        background: "#0f172a",
        resizeTo: hostRef.current,
        antialias: true,
        eventMode: "static",
      });
      if (cancelled) {
        app.destroy();
        return;
      }
      hostRef.current.appendChild(app.canvas);
      appRef.current = app;

      // Grid container
      const grid = new Container();
      app.stage.addChild(grid);

      // Circle texture
const g = new Graphics();
g.circle(0, 0, radius).fill({ color: 0xffffff });
const tex = app.renderer.generateTexture(g);

      // Sprites
      const sprites: Sprite[] = [];
      spritesRef.current = sprites;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const s = new Sprite(tex);
          s.tint = 0x334155; // slate-700
          s.x = c * spacingX + spacingX / 2;
          s.y = r * spacingY + spacingY / 2;
          s.cursor = "crosshair";
          grid.addChild(s);
          sprites.push(s);
        }
      }

      // Paint helper
const handlePaint = (global: PointData) => {
  const c = Math.floor(global.x / spacingX);
  const r = Math.floor(global.y / spacingY);
  if (r < 0 || c < 0 || r >= rows || c >= cols) return;

  const i = r * cols + c;
  const key = `${r},${c}`;
  const currentColor = colorRef.current;

  // ✅ Works in PixiJS v8.2+
  const hex = new Color(currentColor).toNumber();

  const s = sprites[i];
  if (s) {
    s.tint = hex;
    paintRef.current.set(key, currentColor);
  }
};
      // Pointer events (works on iPhone + desktop)
      const onDown = (e: FederatedPointerEvent) => {
        isPaintingRef.current = true;
        handlePaint(e.global);
      };
      const onMove = (e: FederatedPointerEvent) => {
        if (!isPaintingRef.current) return;
        handlePaint(e.global);
      };
      const onUp = () => {
        isPaintingRef.current = false;
      };

      app.stage.hitArea = app.screen;
      app.stage.on("pointerdown", onDown);
      app.stage.on("pointermove", onMove);
      app.stage.on("pointerup", onUp);
      app.stage.on("pointerupoutside", onUp);

      // FPS counter
      let last = performance.now();
      let frames = 0;
      const ticker = app.ticker.add(() => {
        frames++;
        const now = performance.now();
        if (now - last > 1000) {
          setFps(frames);
          frames = 0;
          last = now;
        }
      });

      // Cleanup
      return () => {
        try {
          app.stage.off("pointerdown", onDown);
          app.stage.off("pointermove", onMove);
          app.stage.off("pointerup", onUp);
          app.stage.off("pointerupoutside", onUp);
          ticker?.stop?.();
        } catch {}
        try {
          app.destroy(true); // destroy renderer, stage, textures
        } catch {}
        appRef.current = null;
        spritesRef.current = [];
      };
    })();

    return () => {
      cancelled = true;
      const app = appRef.current;
      if (app) {
        try {
          app.destroy(true);
        } catch {}
        appRef.current = null;
      }
    };
  }, []);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <div ref={hostRef} style={{ width: "100%", height: "90vh" }} />
      <div style={{ color: "#fff", position: "absolute", top: 10, left: 10 }}>
        FPS: {fps}
      </div>
      <div style={{ marginTop: 8, display: "flex", gap: 6, paddingLeft: 10 }}>
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
            title={c}
          />
        ))}
      </div>
    </div>
  );
}
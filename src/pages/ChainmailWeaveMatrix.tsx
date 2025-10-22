import React, { useMemo, useRef, useState, useEffect } from "react";
//import RingRenderer, { computeRingVarsFixedID, generateRings } from "../components/RingRenderer";
import { generateRingsDesigner } from "./components/RingRenderer";
const ID_OPTIONS = ["7/64", "1/8", "9/64", "5/32", "3/16", "1/4", "5/16", "3/8", "7/16", "1/2"];
const WIRE_OPTIONS = [0.9, 1.2, 1.6, 2.0, 2.5, 3.0];
const INCH_MM = 25.4;

export default function ChainmailWeaveMatrix() {
  const [paint, setPaint] = useState(new Map());
  const [scale, setScale] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  // Responsive scaling
  useEffect(() => {
    const onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const scaleFactor = Math.min(w / 1600, h / 900);
      setScale(scaleFactor);
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // === Generate weaves for all ring combos ===
  const weaves = useMemo(() => {
    const all: any[] = [];
    const cellSize = INCH_MM * 1.2; // spacing between weave groups
    const offsetX = -(ID_OPTIONS.length * cellSize) / 2 + cellSize / 2;
    const offsetY = -(WIRE_OPTIONS.length * cellSize) / 2 + cellSize / 2;

    WIRE_OPTIONS.forEach((wd, row) => {
      ID_OPTIONS.forEach((id, col) => {
        const vars = computeRingVarsFixedID(id, wd);

        const weave = generateRings({
          rows: 4,
          cols: 4,
          innerDiameter: vars.ID_mm,
          wireDiameter: vars.WD_mm,
        });

        const groupOffsetX = col * cellSize + offsetX;
        const groupOffsetY = row * cellSize + offsetY;

        // Scale weave to fit cell (~1 inch area)
        const scaled = weave.map((r) => ({
          ...r,
          x: r.x * 0.05 + groupOffsetX,
          y: r.y * 0.05 + groupOffsetY,
          label: `${id}" / ${wd}mm`,
          innerDiameter: vars.ID_mm,
          wireDiameter: vars.WD_mm,
        }));

        all.push(...scaled);
      });
    });

    return all;
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100vw",
        height: "100vh",
        background: "#0F1115",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
      >
        <RingRenderer
          rings={weaves}
          params={{
            rows: WIRE_OPTIONS.length,
            cols: ID_OPTIONS.length,
            innerDiameter: 5,
            wireDiameter: 1,
            ringColor: "#C0C0C0",
            bgColor: "#0F1115",
          }}
          paint={paint}
          setPaint={setPaint}
          activeColor="#FFFFFF"
        />
      </div>
    </div>
  );
}
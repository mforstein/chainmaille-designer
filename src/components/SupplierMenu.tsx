// ==========================
// src/components/SupplierMenu.tsx
// ==========================
import React, { useState, useEffect } from "react";
import { UNIVERSAL_COLORS, MATERIALS } from "../utils/colors";

interface SupplierMenuProps {
  onApplyPalette: (sel: {
    supplier?: string;
    material?: string;
    color?: string;
    wireGauge?: string;
    ringID?: string;
    aspectRatio?: string;
  }) => void;
}

export default function SupplierMenu({ onApplyPalette }: SupplierMenuProps) {
  const [selectedSupplier, setSelectedSupplier] = useState("All Suppliers");
  const [selectedMaterial, setSelectedMaterial] = useState("Choose Material");
  const [selectedColor, setSelectedColor] = useState<string>("Default Colors");
  const [wireGauge, setWireGauge] = useState<string>("1.6"); // mm
  const [ringID, setRingID] = useState<string>("5/16");
  const [aspectRatio, setAspectRatio] = useState<string>("4.96");
  const [showOnlyAvailable, setShowOnlyAvailable] = useState(false);
  const [colors, setColors] = useState<string[]>([]);

  // --- Standard Ring IDs ---
  const ringSizes = ["3/16", "1/4", "5/16", "3/8", "7/16", "1/2"];

  // --- Convert fractional inches to mm ---
  const toMm = (fraction: string): number => {
    if (!fraction) return NaN;
    const parts = fraction.split("/");
    if (parts.length === 2) {
      const num = parseFloat(parts[0]);
      const den = parseFloat(parts[1]);
      if (!isNaN(num) && !isNaN(den)) return (num / den) * 25.4;
    }
    const val = parseFloat(fraction);
    if (!isNaN(val)) return val * 25.4;
    return NaN;
  };

  // --- Supplier-based color sets ---
  const SUPPLIER_COLORS: Record<string, string[]> = {
    "All Suppliers": UNIVERSAL_COLORS,
    "Chain Mail Joe": [
      "#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#FF00FF", "#00FFFF", "#FFA500",
    ],
    "Metal Designz": [
      "#E5E4E2", "#FFD700", "#C0C0C0", "#B87333", "#8A2BE2", "#FF4500",
    ],
    "The Ring Lord": [
      "#A0522D", "#DEB887", "#8B4513", "#D8B07A", "#A9A9A9", "#FFFFFF",
    ],
  };

  // --- Compute AR automatically ---
  useEffect(() => {
    const idMm = toMm(ringID);
    const wdMm = parseFloat(wireGauge) || 1.6;
    if (idMm > 0 && wdMm > 0) {
      const ar = (idMm / wdMm).toFixed(2);
      setAspectRatio(ar);
      // ✅ Automatically update the chainmail panel in real time
      onApplyPalette({
        supplier: selectedSupplier,
        material: selectedMaterial,
        color: selectedColor,
        wireGauge,
        ringID,
        aspectRatio: ar,
      });
    }
  }, [wireGauge, ringID]);

  // --- When material changes, auto-color and highlight ---
  useEffect(() => {
    const mat = MATERIALS.find((m) => m.name === selectedMaterial);
    if (mat) {
      setSelectedColor(mat.hex);
      onApplyPalette({
        supplier: selectedSupplier,
        material: selectedMaterial,
        color: mat.hex,
        wireGauge,
        ringID,
        aspectRatio,
      });
    }
  }, [selectedMaterial]);

  // --- Update colors when supplier changes ---
  useEffect(() => {
    setColors(SUPPLIER_COLORS[selectedSupplier] || UNIVERSAL_COLORS);
  }, [selectedSupplier]);

  const applyPalette = () => {
    onApplyPalette({
      supplier: selectedSupplier,
      material: selectedMaterial,
      color: selectedColor,
      wireGauge,
      ringID,
      aspectRatio,
    });
  };

  const resetDefaults = () => {
    localStorage.removeItem("cmd.params");
    localStorage.removeItem("cmd.paint");
    window.location.reload();
  };

  return (
    <div
      style={{
        width: 360,
        background: "rgba(15,23,42,0.98)",
        borderRadius: 14,
        border: "1px solid rgba(0,0,0,0.6)",
        boxShadow: "0 8px 28px rgba(0,0,0,0.45)",
        padding: "10px 14px 12px 14px",
        color: "#eee",
        fontSize: 13,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        alignItems: "center",
      }}
    >
      {/* --- Supplier / Material --- */}
      <div style={{ display: "flex", gap: 6, width: "100%", justifyContent: "center" }}>
        <select
          value={selectedSupplier}
          onChange={(e) => setSelectedSupplier(e.target.value)}
          style={{ flex: 1 }}
        >
          {Object.keys(SUPPLIER_COLORS).map((sup) => (
            <option key={sup}>{sup}</option>
          ))}
        </select>

        <select
          value={selectedMaterial}
          onChange={(e) => setSelectedMaterial(e.target.value)}
          style={{ flex: 1 }}
        >
          <option>Choose Material</option>
          {MATERIALS.map((m) => (
            <option key={m.name}>{m.name}</option>
          ))}
        </select>
      </div>

      {/* --- Gauge & ID --- */}
      <div
        style={{
          display: "flex",
          gap: 8,
          justifyContent: "center",
          width: "100%",
          marginTop: 6,
        }}
      >
        <label style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          Gauge (mm)
          <input
            type="number"
            step="0.1"
            min="0.5"
            max="3.0"
            value={wireGauge}
            onChange={(e) => setWireGauge(e.target.value)}
            placeholder="1.6"
            style={{ width: 70, textAlign: "center" }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          ID (in)
          <select
            value={ringID}
            onChange={(e) => setRingID(e.target.value)}
            style={{ width: 70, textAlign: "center" }}
          >
            {ringSizes.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span>AR</span>
          <div
            style={{
              width: 60,
              textAlign: "center",
              background: "#1e293b",
              color: "#fff",
              borderRadius: 4,
              padding: "4px 0",
              fontSize: 12,
            }}
          >
            {aspectRatio}
          </div>
        </div>
      </div>

      {/* --- Colors --- */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(8, 1fr)",
          gap: 5,
          justifyContent: "center",
          marginTop: 6,
        }}
      >
        {colors.map((c) => (
          <div
            key={c}
            onClick={() => setSelectedColor(c)}
            style={{
              background: c,
              width: 22,
              height: 22,
              borderRadius: 5,
              border:
                selectedColor === c
                  ? "2px solid white"
                  : "1px solid rgba(255,255,255,0.3)",
              cursor: "pointer",
              transition: "transform 0.1s ease, border 0.2s ease",
              transform: selectedColor === c ? "scale(1.1)" : "scale(1.0)",
            }}
          />
        ))}
      </div>

      {/* --- Show Only Available --- */}
      <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
        <input
          type="checkbox"
          checked={showOnlyAvailable}
          onChange={(e) => setShowOnlyAvailable(e.target.checked)}
        />
        Show only available
      </label>

      {/* --- Buttons --- */}
      <div style={{ display: "flex", gap: 8, justifyContent: "center", width: "100%", marginTop: 8 }}>
        <button
          style={{
            padding: "6px 10px",
            borderRadius: 6,
            background: "#1e293b",
            color: "#eee",
            border: "1px solid #111",
            cursor: "pointer",
          }}
          onClick={applyPalette}
        >
          🎨 Apply Palette
        </button>

        <button
          style={{
            padding: "6px 10px",
            borderRadius: 6,
            background: "#1e293b",
            color: "#eee",
            border: "1px solid #111",
            cursor: "pointer",
          }}
          onClick={resetDefaults}
        >
          🔁 Return to Default
        </button>
      </div>
    </div>
  );
}
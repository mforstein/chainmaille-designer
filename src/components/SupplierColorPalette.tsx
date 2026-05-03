import React, { useState, useMemo } from "react";
import { SUPPLIER_INFO, PRODUCTS_BY_SUPPLIER, getSupplierSwatches } from "../data/supplierCatalog";
import type { SupplierId, ItemType } from "../data/supplierCatalog";

const SUPPLIERS: SupplierId[] = ["trl", "cmj", "mdz", "spg"];

const MATERIAL_LABELS: Record<string, string> = {
  anodized_aluminum: "Anodized Al.",
  aluminum:          "Aluminum",
  stainless_steel:   "Stainless",
  sterling_silver:   "Sterling",
  argentium:         "Argentium",
  copper:            "Copper",
  bronze:            "Bronze",
  brass:             "Brass",
  niobium:           "Niobium",
  titanium:          "Titanium",
  gold_filled:       "Gold Filled",
  other:             "Other",
};

interface Props {
  onSelectColor: (hex: string, colorName: string) => void;
  activeColor?: string;
  /** Colors already in the user's palette — shown with a checkmark */
  paletteColors?: string[];
}

export default function SupplierColorPalette({
  onSelectColor,
  activeColor,
  paletteColors = [],
}: Props) {
  const [supplierId, setSupplierId] = useState<SupplierId>("trl");
  const [typeFilter, setTypeFilter] = useState<ItemType | "all">("all");

  const swatches = useMemo(
    () => getSupplierSwatches(supplierId, typeFilter === "all" ? undefined : typeFilter),
    [supplierId, typeFilter],
  );

  // Group by material for cleaner UI
  const grouped = useMemo(() => {
    const g: Record<string, typeof swatches> = {};
    for (const s of swatches) {
      (g[s.material] ??= []).push(s);
    }
    return g;
  }, [swatches]);

  const info = SUPPLIER_INFO[supplierId];

  const paletteSet = useMemo(
    () => new Set(paletteColors.map((c) => c.toLowerCase())),
    [paletteColors],
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        width: 210,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {/* Supplier tabs */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {SUPPLIERS.map((id) => {
          const si = SUPPLIER_INFO[id];
          const active = id === supplierId;
          return (
            <button
              key={id}
              onClick={() => setSupplierId(id)}
              style={{
                padding: "4px 8px",
                borderRadius: 6,
                border: `1px solid ${active ? si.color : "rgba(255,255,255,0.1)"}`,
                background: active ? si.color + "33" : "transparent",
                color: active ? "#f9fafb" : "#9ca3af",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: active ? 700 : 400,
                whiteSpace: "nowrap",
              }}
            >
              {si.name.split(" ")[0]}
            </button>
          );
        })}
      </div>

      {/* Type filter */}
      <div style={{ display: "flex", gap: 4 }}>
        {(["all", "ring", "scale"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            style={{
              flex: 1,
              padding: "3px 0",
              borderRadius: 5,
              border: "1px solid rgba(255,255,255,0.1)",
              background: typeFilter === t ? "rgba(37,99,235,0.7)" : "transparent",
              color: typeFilter === t ? "#f9fafb" : "#9ca3af",
              cursor: "pointer",
              fontSize: 10,
              fontWeight: typeFilter === t ? 700 : 400,
              textTransform: "capitalize",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Color groups */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 300, overflowY: "auto" }}>
        {Object.entries(grouped).map(([material, list]) => (
          <div key={material}>
            <div style={{ fontSize: 9, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
              {MATERIAL_LABELS[material] ?? material}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {list.map((sw) => {
                const isActive = activeColor?.toLowerCase() === sw.colorHex.toLowerCase();
                const inPalette = paletteSet.has(sw.colorHex.toLowerCase());
                const typeBadge = sw.itemTypes.length === 1
                  ? (sw.itemTypes[0] === "ring" ? "R" : "S")
                  : "R+S";
                return (
                  <button
                    key={sw.colorHex + sw.material}
                    title={`${sw.colorName} (${MATERIAL_LABELS[sw.material] ?? sw.material})\n${typeBadge} · ${sw.skus.length} SKU${sw.skus.length !== 1 ? "s" : ""}\nClick to use`}
                    onClick={() => onSelectColor(sw.colorHex, sw.colorName)}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 5,
                      background: sw.colorHex,
                      border: isActive
                        ? "2px solid #f9fafb"
                        : "1px solid rgba(255,255,255,0.15)",
                      cursor: "pointer",
                      position: "relative",
                      flexShrink: 0,
                      boxShadow: isActive ? "0 0 0 1px #2563eb" : "none",
                    }}
                  >
                    {inPalette && !isActive && (
                      <span
                        style={{
                          position: "absolute",
                          bottom: 1,
                          right: 1,
                          fontSize: 7,
                          lineHeight: 1,
                          color: "rgba(255,255,255,0.9)",
                          textShadow: "0 0 2px #000",
                          pointerEvents: "none",
                        }}
                      >
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {Object.keys(grouped).length === 0 && (
          <div style={{ color: "#6b7280", fontSize: 12 }}>
            No colors available for this filter.
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ fontSize: 10, color: "#4b5563", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 4 }}>
        <a
          href={info.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#6b7280", textDecoration: "none" }}
        >
          {info.name} ↗
        </a>
        {" · "}
        {PRODUCTS_BY_SUPPLIER[supplierId].length} products · prices approx.
      </div>
    </div>
  );
}

// FreeformCostPanel.tsx
// Material cost estimator for Freeform 2D — matches ring/scale BOM to supplier catalog,
// estimates shipping and flags possible import tariffs.

import React, { useMemo, useState } from "react";
import { estimateCost, type BOMLineItem } from "../lib/supplierMatcher";
import type { SupplierId } from "../data/supplierCatalog/schema";

// ── Supplier metadata ─────────────────────────────────────────────────────────

interface SupplierMeta {
  id: SupplierId;
  label: string;
  color: string;
  country: string;
  flatShipping: number;
  freeShippingAt: number;
  transitDays: string;
  tariffNote: string | null;
}

const SUPPLIERS: SupplierMeta[] = [
  {
    id: "trl",
    label: "The Ring Lord",
    color: "#0369a1",
    country: "🇨🇦 Canada",
    flatShipping: 13.99,
    freeShippingAt: 100,
    transitDays: "7–14 days",
    tariffNote: "Canadian goods may be subject to US import tariffs (currently 0–25% depending on material/trade status). Aluminum/anodized items typically qualify for 0% under USMCA.",
  },
  {
    id: "cmj",
    label: "Chainmail Joe",
    color: "#0f766e",
    country: "🇺🇸 USA",
    flatShipping: 5.99,
    freeShippingAt: 50,
    transitDays: "3–7 days",
    tariffNote: null,
  },
  {
    id: "mdz",
    label: "Metal Designz",
    color: "#7c3aed",
    country: "🇺🇸 USA",
    flatShipping: 6.99,
    freeShippingAt: 75,
    transitDays: "3–7 days",
    tariffNote: null,
  },
  {
    id: "spg",
    label: "Steampunk Garage",
    color: "#b45309",
    country: "🇺🇸 USA",
    flatShipping: 8.99,
    freeShippingAt: 75,
    transitDays: "5–10 days",
    tariffNote: null,
  },
];

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  // rings: array of [colorHex, count]
  ringColorCounts: [string, number][];
  innerDiameterMm: number;
  wireDiameterMm: number;
  // scales
  scaleColorCounts: [string, number][];
  scaleWidthMm: number;
  scaleHeightMm: number;
  onClose: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

function ColorDot({ hex }: { hex: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 12,
        height: 12,
        borderRadius: "50%",
        background: hex,
        border: "1px solid rgba(255,255,255,0.18)",
        flexShrink: 0,
      }}
    />
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FreeformCostPanel({
  ringColorCounts,
  innerDiameterMm,
  wireDiameterMm,
  scaleColorCounts,
  scaleWidthMm,
  scaleHeightMm,
  onClose,
}: Props) {
  const [supplierId, setSupplierId] = useState<SupplierId>("trl");
  const [showUnmatched, setShowUnmatched] = useState(false);

  const supplier = SUPPLIERS.find((s) => s.id === supplierId)!;

  const lineItems = useMemo<BOMLineItem[]>(() => {
    const items: BOMLineItem[] = [];
    for (const [colorHex, quantity] of ringColorCounts) {
      items.push({ type: "ring", colorHex, quantity, innerDiameterMm, wireDiameterMm });
    }
    for (const [colorHex, quantity] of scaleColorCounts) {
      items.push({ type: "scale", colorHex, quantity, widthMm: scaleWidthMm, heightMm: scaleHeightMm });
    }
    return items;
  }, [ringColorCounts, innerDiameterMm, wireDiameterMm, scaleColorCounts, scaleWidthMm, scaleHeightMm]);

  const summary = useMemo(() => estimateCost(lineItems, supplierId), [lineItems, supplierId]);

  const shipping = summary.subtotal >= supplier.freeShippingAt ? 0 : supplier.flatShipping;
  const totalBeforeTariff = summary.subtotal + shipping;

  const matched = summary.lines.filter((l) => l.product !== null);
  const unmatched = summary.lines.filter((l) => l.product === null);
  const displayLines = showUnmatched ? summary.lines : matched;

  const ringLines = displayLines.filter((l) => l.lineItem.type === "ring");
  const scaleLines = displayLines.filter((l) => l.lineItem.type === "scale");

  const totalRings = ringColorCounts.reduce((s, [, n]) => s + n, 0);
  const totalScales = scaleColorCounts.reduce((s, [, n]) => s + n, 0);

  return (
    <div
      style={{
        position: "fixed",
        top: 60,
        right: 16,
        width: 400,
        maxHeight: "calc(100vh - 80px)",
        overflowY: "auto",
        background: "#111827",
        border: "1px solid #1f2937",
        borderRadius: 14,
        boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
        zIndex: 3500,
        color: "#e5e7eb",
        fontFamily: "system-ui, sans-serif",
        fontSize: 13,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px 10px", borderBottom: "1px solid #1f2937" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, color: "#f9fafb" }}>Material Cost Estimator</div>
          <div style={{ color: "#6b7280", fontSize: 11, marginTop: 2 }}>
            {totalRings.toLocaleString()} rings · {totalScales.toLocaleString()} scales · {lineItems.length} colors
          </div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
      </div>

      {/* Supplier tabs */}
      <div style={{ display: "flex", gap: 6, padding: "10px 16px", borderBottom: "1px solid #1f2937", flexWrap: "wrap" }}>
        {SUPPLIERS.map((s) => (
          <button
            key={s.id}
            onClick={() => setSupplierId(s.id)}
            style={{
              padding: "5px 10px",
              borderRadius: 8,
              border: `1px solid ${supplierId === s.id ? s.color : "#374151"}`,
              background: supplierId === s.id ? s.color + "22" : "transparent",
              color: supplierId === s.id ? "#f9fafb" : "#9ca3af",
              fontWeight: supplierId === s.id ? 700 : 400,
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Supplier info strip */}
      <div style={{ padding: "8px 16px", background: "#0f172a", fontSize: 11, color: "#6b7280", display: "flex", gap: 16, flexWrap: "wrap" }}>
        <span>{supplier.country}</span>
        <span>✈ {supplier.transitDays}</span>
        <span>📦 {supplier.freeShippingAt > 0 ? `Free shipping over ${fmt(supplier.freeShippingAt)}` : "Free shipping"}, else {fmt(supplier.flatShipping)}</span>
      </div>

      {lineItems.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center", color: "#6b7280" }}>
          No rings or scales on canvas yet.
        </div>
      ) : (
        <>
          {/* Ring lines */}
          {ringLines.length > 0 && (
            <Section label={`Rings (ID ${innerDiameterMm.toFixed(1)}mm / WD ${wireDiameterMm.toFixed(1)}mm)`} color="#3b82f6">
              {ringLines.map((l, i) => (
                <LineRow key={i} line={l} supplierColor={supplier.color} />
              ))}
            </Section>
          )}

          {/* Scale lines */}
          {scaleLines.length > 0 && (
            <Section label={`Scales (${scaleWidthMm.toFixed(1)}mm × ${scaleHeightMm.toFixed(1)}mm)`} color="#a78bfa">
              {scaleLines.map((l, i) => (
                <LineRow key={i} line={l} supplierColor={supplier.color} />
              ))}
            </Section>
          )}

          {/* Unmatched toggle */}
          {unmatched.length > 0 && (
            <div style={{ padding: "6px 16px" }}>
              <button
                onClick={() => setShowUnmatched((v) => !v)}
                style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 12, padding: 0 }}
              >
                {showUnmatched ? "▾" : "▸"} {unmatched.length} unmatched color{unmatched.length > 1 ? "s" : ""} (no catalog entry)
              </button>
            </div>
          )}

          {/* Totals */}
          <div style={{ borderTop: "1px solid #1f2937", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
            <Row label="Material subtotal" value={fmt(summary.subtotal)} />
            <Row
              label={shipping === 0 ? "Shipping (free)" : `Shipping (est. to USA)`}
              value={shipping === 0 ? "FREE" : fmt(shipping)}
              dim={shipping === 0}
            />
            <Row label="Total estimate" value={fmt(totalBeforeTariff)} bold />

            {supplier.tariffNote && (
              <div style={{ marginTop: 8, padding: "8px 10px", background: "#451a03", border: "1px solid #92400e", borderRadius: 8, color: "#fcd34d", fontSize: 11, lineHeight: 1.5 }}>
                ⚠️ {supplier.tariffNote}
              </div>
            )}

            <div style={{ marginTop: 6, color: "#4b5563", fontSize: 11, lineHeight: 1.5 }}>
              Estimates only — actual prices, pack sizes, and availability may differ. Always verify on supplier site before ordering.
              {summary.unmatchedCount > 0 && ` ${summary.unmatchedCount} item(s) not found in catalog.`}
            </div>
          </div>

          {/* Order summary */}
          {matched.length > 0 && (
            <div style={{ borderTop: "1px solid #1f2937", padding: "10px 16px" }}>
              <div style={{ color: "#6b7280", fontSize: 11, marginBottom: 8 }}>SUGGESTED ORDER LINKS</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {matched
                  .filter((l) => l.product?.url)
                  .slice(0, 8)
                  .map((l, i) => (
                    <a
                      key={i}
                      href={l.product!.affiliateUrl ?? l.product!.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "5px 8px",
                        background: "#1f2937",
                        borderRadius: 7,
                        textDecoration: "none",
                        color: "#d1d5db",
                        fontSize: 11,
                      }}
                    >
                      <ColorDot hex={l.lineItem.colorHex} />
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {l.product!.name}
                      </span>
                      <span style={{ color: "#6b7280", flexShrink: 0 }}>
                        ×{l.packsNeeded} pk → {fmt(l.totalCost)}
                      </span>
                      <span style={{ color: supplier.color, flexShrink: 0 }}>↗</span>
                    </a>
                  ))}
                {matched.filter((l) => l.product?.url).length > 8 && (
                  <div style={{ color: "#4b5563", fontSize: 11, textAlign: "center" }}>
                    +{matched.filter((l) => l.product?.url).length - 8} more items
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ label, color, children }: { label: string; color: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ padding: "8px 16px 4px", fontSize: 11, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      {children}
    </div>
  );
}

function LineRow({ line, supplierColor }: { line: ReturnType<typeof estimateCost>["lines"][number]; supplierColor: string }) {
  const { lineItem, product, packsNeeded, totalCost, colorMatch } = line;
  const matched = product !== null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "5px 16px",
        borderBottom: "1px solid #1f293720",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
        <span
          style={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: lineItem.colorHex,
            border: "1px solid rgba(255,255,255,0.15)",
            flexShrink: 0,
          }}
        />
        {matched ? (
          <span style={{ color: colorMatch ? "#d1d5db" : "#fbbf24", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={product!.name}>
            {product!.name}
            {!colorMatch && <span style={{ color: "#fbbf24", marginLeft: 4 }}>~color</span>}
          </span>
        ) : (
          <span style={{ color: "#f87171", fontSize: 12 }}>No catalog match</span>
        )}
      </div>
      <span style={{ color: "#6b7280", fontSize: 11, flexShrink: 0 }}>×{lineItem.quantity.toLocaleString()}</span>
      {matched ? (
        <span style={{ color: supplierColor, fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
          {packsNeeded}pk · {totalCost.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 })}
        </span>
      ) : (
        <span style={{ color: "#4b5563", fontSize: 12 }}>—</span>
      )}
    </div>
  );
}

function Row({ label, value, bold, dim }: { label: string; value: string; bold?: boolean; dim?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ color: dim ? "#4b5563" : "#9ca3af" }}>{label}</span>
      <span style={{ fontWeight: bold ? 800 : 600, color: bold ? "#f9fafb" : dim ? "#4b5563" : "#e5e7eb" }}>{value}</span>
    </div>
  );
}

import React, { useState, useMemo } from "react";
import { estimateCost } from "../lib/supplierMatcher";
import type { BOMLineItem } from "../lib/supplierMatcher";
import { SUPPLIER_INFO } from "../data/supplierCatalog";
import type { SupplierId } from "../data/supplierCatalog";
import RequiresTier from "../auth/RequiresTier";
import SupplierColorPalette from "./SupplierColorPalette";

interface CostEstimatorProps {
  lineItems: BOMLineItem[];
}

const SUPPLIERS: SupplierId[] = ["trl", "cmj", "mdz", "spg"];

export default function CostEstimator({ lineItems }: CostEstimatorProps) {
  return (
    <RequiresTier minTier="studio" featureName="Supplier Cost Estimator" inline>
      <CostEstimatorInner lineItems={lineItems} />
    </RequiresTier>
  );
}

function CostEstimatorInner({ lineItems }: CostEstimatorProps) {
  const [selectedSupplier, setSelectedSupplier] = useState<SupplierId>("trl");
  const [showColorBrowser, setShowColorBrowser] = useState(false);

  const summary = useMemo(
    () => estimateCost(lineItems, selectedSupplier),
    [lineItems, selectedSupplier]
  );

  const info = SUPPLIER_INFO[selectedSupplier];

  return (
    <div
      style={{
        background: "rgba(17,24,39,0.7)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 12,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 14, color: "#f9fafb" }}>
        Supplier Cost Estimate
      </div>

      {/* Supplier picker */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {SUPPLIERS.map((id) => {
          const si = SUPPLIER_INFO[id];
          return (
            <button
              key={id}
              onClick={() => setSelectedSupplier(id)}
              style={{
                padding: "5px 12px",
                borderRadius: 7,
                border: `1px solid ${selectedSupplier === id ? si.color : "rgba(255,255,255,0.1)"}`,
                background: selectedSupplier === id ? si.color + "22" : "transparent",
                color: selectedSupplier === id ? "#f9fafb" : "#9ca3af",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: selectedSupplier === id ? 700 : 400,
              }}
            >
              {si.name}
            </button>
          );
        })}
      </div>

      {/* Line items */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {summary.lines.length === 0 && (
          <div style={{ color: "#6b7280", fontSize: 13 }}>No items in design.</div>
        )}
        {summary.lines.map((line, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: 12,
              color: line.product ? "#e5e7eb" : "#ef4444",
              background: "rgba(255,255,255,0.03)",
              borderRadius: 6,
              padding: "5px 8px",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: line.lineItem.colorHex,
                  border: "1px solid rgba(255,255,255,0.2)",
                  flexShrink: 0,
                }}
              />
              <span>
                {line.lineItem.type === "ring"
                  ? `Ring ${line.lineItem.innerDiameterMm}mm / ${line.lineItem.wireDiameterMm}mm`
                  : `Scale ${line.lineItem.widthMm}×${line.lineItem.heightMm}mm`}
                {" "}× {line.lineItem.quantity}
              </span>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              {line.product ? (
                <>
                  <div style={{ fontWeight: 700 }}>${line.totalCost.toFixed(2)}</div>
                  <div style={{ color: "#6b7280", fontSize: 11 }}>
                    {line.packsNeeded} pack{line.packsNeeded !== 1 ? "s" : ""}
                    {!line.colorMatch && (
                      <span title="Closest geometry match — color may differ" style={{ color: "#f59e0b", marginLeft: 4 }}>
                        ~color
                      </span>
                    )}
                    {" · "}
                    <a
                      href={line.product.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "#60a5fa", textDecoration: "none" }}
                    >
                      Buy ↗
                    </a>
                  </div>
                </>
              ) : (
                <span style={{ fontSize: 11 }}>No match found</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Totals */}
      {summary.lines.length > 0 && (
        <div
          style={{
            borderTop: "1px solid rgba(255,255,255,0.08)",
            paddingTop: 10,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#f9fafb" }}>
              Estimated Total
            </div>
            {summary.unmatchedCount > 0 && (
              <div style={{ color: "#f87171", fontSize: 11 }}>
                {summary.unmatchedCount} item{summary.unmatchedCount !== 1 ? "s" : ""} not matched
              </div>
            )}
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#34d399" }}>
            ${summary.subtotal.toFixed(2)}
          </div>
        </div>
      )}

      {/* Browse supplier colors */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 8 }}>
        <button
          onClick={() => setShowColorBrowser((v) => !v)}
          style={{
            width: "100%",
            padding: "6px 10px",
            borderRadius: 7,
            border: "1px solid rgba(255,255,255,0.1)",
            background: showColorBrowser ? "rgba(180,83,9,0.3)" : "rgba(255,255,255,0.04)",
            color: "#9ca3af",
            cursor: "pointer",
            fontSize: 11,
            fontWeight: 600,
            textAlign: "left",
          }}
        >
          🏭 Browse available colors for {info.name}
        </button>
        {showColorBrowser && (
          <div style={{ marginTop: 8 }}>
            <SupplierColorPalette
              onSelectColor={() => {}}
            />
          </div>
        )}
      </div>

      <div style={{ fontSize: 11, color: "#4b5563" }}>
        Prices from{" "}
        <a href={info.url} target="_blank" rel="noopener noreferrer" style={{ color: "#6b7280" }}>
          {info.name}
        </a>
        {" · "}Always confirm availability before ordering.
      </div>
    </div>
  );
}

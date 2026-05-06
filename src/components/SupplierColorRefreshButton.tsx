// src/components/SupplierColorRefreshButton.tsx
// Drop-in button that calls the Netlify supplier scraper and updates the local cache.
// Use compact={true} for tight toolbar contexts.

import React, { useState } from "react";
import { refreshSupplierColors, getCachedSupplierColors } from "../lib/supplierColors";

interface Props {
  onRefreshed?: () => void;
  compact?: boolean;
  style?: React.CSSProperties;
}

export default function SupplierColorRefreshButton({ onRefreshed, compact = false, style }: Props) {
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [msg, setMsg] = useState("");

  const cached = getCachedSupplierColors();
  const ageMin = cached ? Math.round((Date.now() - cached.timestamp) / 60_000) : null;

  const handleRefresh = async () => {
    if (status === "loading") return;
    setStatus("loading");
    setMsg("");
    try {
      const data = await refreshSupplierColors(true);
      const total = Object.values(data.bySupplier).flat().length;
      const suppliers = Object.keys(data.bySupplier).length;
      const scaleCount = data.scaleColors.length;
      setStatus("ok");
      setMsg(`${total} ring colors, ${scaleCount} scale colors from ${suppliers} suppliers`);
      onRefreshed?.();
      setTimeout(() => { setStatus("idle"); setMsg(""); }, 5_000);
    } catch (err: any) {
      setStatus("error");
      setMsg(err?.message || "Refresh failed — check network");
      setTimeout(() => { setStatus("idle"); setMsg(""); }, 6_000);
    }
  };

  const bg =
    status === "loading" ? "rgba(255,255,255,0.06)"
    : status === "ok"    ? "rgba(34,197,94,0.18)"
    : status === "error" ? "rgba(239,68,68,0.18)"
    : "rgba(255,255,255,0.10)";

  const icon =
    status === "loading" ? "⏳"
    : status === "ok"    ? "✅"
    : status === "error" ? "❌"
    : "🔄";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", ...style }}>
      <button
        onClick={handleRefresh}
        disabled={status === "loading"}
        title="Fetch latest ring & scale colors from supplier websites (Chainmail Joe, The Ring Lord, MetalDesignz)"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          padding: compact ? "5px 10px" : "8px 14px",
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.15)",
          background: bg,
          color: "#e5e7eb",
          cursor: status === "loading" ? "not-allowed" : "pointer",
          fontSize: compact ? 11 : 13,
          fontWeight: 600,
          whiteSpace: "nowrap",
          transition: "background 0.2s",
        }}
      >
        <span>{icon}</span>
        <span>{compact ? "Refresh Colors" : "Refresh Supplier Colors"}</span>
      </button>

      {msg ? (
        <span style={{ fontSize: 11, color: status === "error" ? "#f87171" : "#86efac", maxWidth: 260 }}>
          {msg}
        </span>
      ) : ageMin !== null ? (
        <span style={{ fontSize: 11, color: "#6b7280" }}>
          cached {ageMin < 1 ? "<1" : ageMin}m ago
        </span>
      ) : (
        <span style={{ fontSize: 11, color: "#6b7280" }}>
          not yet fetched
        </span>
      )}
    </div>
  );
}

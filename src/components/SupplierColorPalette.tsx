import React, { useState, useMemo } from "react";
import type { ItemType } from "../data/supplierCatalog";
import { functionBase } from "../lib/native";

// Specific-supplier tabs were removed 2026-06-01 (per Erin). The panel is now
// a generic "check available colors at a supplier website" flow: enter any
// URL, click Search, the server scans the page for hex color codes and named
// swatches, and shows whatever it finds. The user's default palette above is
// untouched no matter what the search returns. The 4-supplier catalog data
// (Catalog A/B/C/D) still ships in the bundle to support legacy designs and
// the Ring Size Chart's "Available Colors" aggregation, but it is no longer
// surfaced as a browseable, named catalog in this panel.

interface ScrapedSwatch {
  colorHex: string;
  colorName: string;
  source?: "ring" | "scale" | "both";
}

interface CheckColorsResponse {
  ok: boolean;
  swatches?: ScrapedSwatch[];
  count?: number;
  message?: string;
}

interface Props {
  onSelectColor: (hex: string, colorName: string) => void;
  activeColor?: string;
  /** Colors already in the user's palette — shown with a checkmark */
  paletteColors?: string[];
  /** Fired once with ALL found hexes when a search returns results (auto-add flow). */
  onColorsFound?: (hexes: string[]) => void;
}

const ITEM_FILTERS: Array<{ value: ItemType | "all"; label: string }> = [
  { value: "all",   label: "All" },
  { value: "ring",  label: "Rings" },
  { value: "scale", label: "Scales" },
];

export default function SupplierColorPalette({
  onSelectColor,
  activeColor,
  paletteColors = [],
  onColorsFound,
}: Props) {
  const [url, setUrl] = useState("");
  const [typeFilter, setTypeFilter] = useState<ItemType | "all">("all");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "ok"; swatches: ScrapedSwatch[]; sourceUrl: string }
    | { kind: "empty"; sourceUrl: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  const paletteSet = useMemo(
    () => new Set(paletteColors.map((c) => c.toLowerCase())),
    [paletteColors],
  );

  const filteredSwatches: ScrapedSwatch[] = useMemo(() => {
    if (status.kind !== "ok") return [];
    if (typeFilter === "all") return status.swatches;
    return status.swatches.filter((s) =>
      s.source === typeFilter || s.source === "both" || s.source === undefined,
    );
  }, [status, typeFilter]);

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) {
      setStatus({ kind: "error", message: "Enter a supplier website URL above." });
      return;
    }
    let normalized = trimmed;
    if (!/^https?:\/\//i.test(normalized)) normalized = `https://${normalized}`;
    try {
      // Validate URL shape on the client before bothering the server.
      // eslint-disable-next-line no-new
      new URL(normalized);
    } catch {
      setStatus({ kind: "error", message: "That doesn't look like a valid URL." });
      return;
    }
    setBusy(true);
    setStatus({ kind: "idle" });
    try {
      const res = await fetch(`${functionBase()}/.netlify/functions/check-supplier-colors`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: normalized }),
      });
      let data: CheckColorsResponse = { ok: false };
      try { data = await res.json(); } catch { /* empty body */ }
      if (!res.ok || !data.ok) {
        setStatus({
          kind: "error",
          message: data.message ?? `Couldn't read that site (${res.status}). Your default palette is unchanged.`,
        });
      } else if (!data.swatches || data.swatches.length === 0) {
        setStatus({ kind: "empty", sourceUrl: normalized });
      } else {
        setStatus({ kind: "ok", swatches: data.swatches, sourceUrl: normalized });
        // Auto-add flow: hand the whole found set to the parent at once.
        onColorsFound?.(data.swatches.map((s) => s.colorHex));
      }
    } catch (err: any) {
      setStatus({
        kind: "error",
        message: err?.message ?? "Network error while reading that site.",
      });
    } finally {
      setBusy(false);
    }
  }

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
      {/* URL search prompt */}
      <form onSubmit={runSearch} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label style={{ fontSize: 10, color: "#9ca3af", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Check available colors
        </label>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="supplier-website.com"
          disabled={busy}
          style={{
            width: "100%",
            padding: "6px 8px",
            borderRadius: 6,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(15,23,42,0.7)",
            color: "#e5e7eb",
            fontSize: 12,
            outline: "none",
            boxSizing: "border-box",
          }}
        />
        <button
          type="submit"
          disabled={busy}
          style={{
            padding: "6px 0",
            borderRadius: 6,
            border: "none",
            background: busy ? "#1f2937" : "#7c3aed",
            color: "#f9fafb",
            cursor: busy ? "default" : "pointer",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {busy ? "Searching…" : "🔎 Search"}
        </button>
      </form>

      {/* Status row (error or empty result) */}
      {status.kind === "error" && (
        <div style={{ fontSize: 11, color: "#fda4af", lineHeight: 1.4 }}>
          {status.message}
        </div>
      )}
      {status.kind === "empty" && (
        <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.4 }}>
          No colors detected on that page. Your default palette is still active.
        </div>
      )}

      {/* Type filter — only shown when there's something to filter */}
      {status.kind === "ok" && status.swatches.length > 0 && (
        <div style={{ display: "flex", gap: 4 }}>
          {ITEM_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setTypeFilter(f.value)}
              style={{
                flex: 1,
                padding: "3px 0",
                borderRadius: 5,
                border: "1px solid rgba(255,255,255,0.1)",
                background: typeFilter === f.value ? "rgba(37,99,235,0.7)" : "transparent",
                color: typeFilter === f.value ? "#f9fafb" : "#9ca3af",
                cursor: "pointer",
                fontSize: 10,
                fontWeight: typeFilter === f.value ? 700 : 400,
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* Result swatches */}
      {status.kind === "ok" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 300, overflowY: "auto" }}>
          {filteredSwatches.length === 0 ? (
            <div style={{ color: "#6b7280", fontSize: 11 }}>
              No colors match this filter.
            </div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {filteredSwatches.map((sw, i) => {
                const isActive = activeColor?.toLowerCase() === sw.colorHex.toLowerCase();
                const inPalette = paletteSet.has(sw.colorHex.toLowerCase());
                return (
                  <button
                    key={`${sw.colorHex}-${i}`}
                    title={`${sw.colorName}\nClick to use`}
                    onClick={() => onSelectColor(sw.colorHex, sw.colorName)}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 5,
                      background: sw.colorHex,
                      border: isActive ? "2px solid #f9fafb" : "1px solid rgba(255,255,255,0.15)",
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
          )}
          <div style={{ fontSize: 10, color: "#6b7280", lineHeight: 1.5, marginTop: 2 }}>
            Found {status.swatches.length} color{status.swatches.length === 1 ? "" : "s"}.
            The site's color list may or may not be complete — verify availability
            with the supplier directly before ordering.
          </div>
        </div>
      )}

      {/* First-run / idle hint */}
      {status.kind === "idle" && !busy && (
        <div style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.45 }}>
          Enter a supplier's website above and click <strong>Search</strong>
          {" "}to pull the colors they list. Your default palette (top) stays active either way.
        </div>
      )}
    </div>
  );
}

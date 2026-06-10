// src/components/ProjectLibraryPanel.tsx
// Design Library — browse saved projects + starter templates.
// Supports "Load" (replace) and "Append" (merge by col-offsetting to the right).

import React, { useEffect, useRef, useState, useMemo } from "react";
import { STARTER_TEMPLATES, type StarterTemplate } from "../data/starterTemplates";
import ImageToDesignPanel from "./ImageToDesignPanel";

// ── Types matching the freeform project save format ──────────────────────────
export interface LibraryProject {
  id: string;
  name: string;
  updatedAt: number;
  thumbnail?: { pngDataUrl: string; width: number; height: number } | null;
  // partial project data stored lazily from localStorage
  ringCount?: number;
  scaleCount?: number;
}

export type LoadMode = "replace" | "append";

interface Props {
  onLoad: (data: any, mode: LoadMode) => void;
  onClose: () => void;
}

// ── LocalStorage helpers ──────────────────────────────────────────────────────
const INDEX_KEY = "chainmail.projectIndex.v1";

function readIndex(): LibraryProject[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const idx = JSON.parse(raw) as any[];
    return idx
      .filter((e) => e && typeof e.id === "string")
      .map((e) => ({
        id: e.id,
        name: e.name ?? "Untitled",
        updatedAt: e.updatedAt ?? 0,
        thumbnail: e.thumbnail ?? null,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

function readProject(id: string): any | null {
  try {
    const raw = localStorage.getItem(`chainmail.project:${id}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function deleteProject(id: string) {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return;
    const idx = (JSON.parse(raw) as any[]).filter((e) => e?.id !== id);
    localStorage.setItem(INDEX_KEY, JSON.stringify(idx));
    localStorage.removeItem(`chainmail.project:${id}`);
  } catch {}
}

function formatDate(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// ── Small canvas thumbnail for starter templates ──────────────────────────────
function TemplateThumbnail({
  rings,
  scaleColors,
}: {
  rings: { row: number; col: number; color: string }[];
  scaleColors: { key: string; color: string }[];
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cvs = ref.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;

    const W = cvs.width;
    const H = cvs.height;
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    if (rings.length === 0) {
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#334155";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Blank Canvas", W / 2, H / 2);
      return;
    }

    // Compute bounds
    let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
    for (const r of rings) {
      if (r.row < minR) minR = r.row;
      if (r.row > maxR) maxR = r.row;
      if (r.col < minC) minC = r.col;
      if (r.col > maxC) maxC = r.col;
    }
    const rangeR = Math.max(1, maxR - minR + 1);
    const rangeC = Math.max(1, maxC - minC + 1);
    const pad = 6;
    const cellW = (W - pad * 2) / rangeC;
    const cellH = (H - pad * 2) / rangeR;
    const r0 = Math.min(cellW, cellH) * 0.42;

    // Scale color lookup
    const scaleMap = new Map(scaleColors.map((s) => [s.key, s.color]));

    for (const ring of rings) {
      const cx = pad + (ring.col - minC + 0.5) * cellW + ((ring.row - minR) & 1 ? cellW * 0.5 : 0);
      const cy = pad + (ring.row - minR + 0.5) * cellH;
      const scColor = scaleMap.get(`${ring.row},${ring.col}`);

      // Draw scale (if present) as a filled teardrop hint
      if (scColor) {
        ctx.fillStyle = scColor;
        ctx.beginPath();
        ctx.ellipse(cx, cy + r0 * 0.4, r0 * 0.55, r0 * 0.9, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw ring as torus circle
      ctx.beginPath();
      ctx.arc(cx, cy, r0, 0, Math.PI * 2);
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = Math.max(1, r0 * 0.28);
      ctx.stroke();
    }
  }, [rings, scaleColors]);

  return (
    <canvas
      ref={ref}
      width={180}
      height={112}
      style={{ width: "100%", height: "100%", display: "block", borderRadius: 6 }}
    />
  );
}

// ── Project card ─────────────────────────────────────────────────────────────
function ProjectCard({
  label,
  description,
  thumbnail,
  thumbNode,
  ringCount,
  scaleCount,
  date,
  canDelete,
  onLoad,
  onAppend,
  onDelete,
}: {
  label: string;
  description?: string;
  thumbnail?: string | null;
  thumbNode?: React.ReactNode;
  ringCount?: number;
  scaleCount?: number;
  date?: string;
  canDelete?: boolean;
  onLoad: () => void;
  onAppend: () => void;
  onDelete?: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={{
        background: hovered ? "#1e293b" : "#111827",
        border: `1px solid ${hovered ? "#334155" : "#1e293b"}`,
        borderRadius: 12,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        transition: "background 0.15s, border-color 0.15s",
        cursor: "default",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Thumbnail */}
      <div
        style={{
          height: 112,
          background: "#0f172a",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={label}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          thumbNode
        )}
      </div>

      {/* Body */}
      <div style={{ padding: "8px 10px", flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "#e2e8f0",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          title={label}
        >
          {label}
        </div>
        {description && (
          <div
            style={{
              fontSize: 10,
              color: "#64748b",
              lineHeight: 1.35,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {description}
          </div>
        )}
        <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>
          {ringCount !== undefined && `${ringCount} rings`}
          {scaleCount !== undefined && scaleCount > 0 && ` · ${scaleCount} scales`}
          {date && <span style={{ marginLeft: 4, color: "#334155" }}>{date}</span>}
        </div>
      </div>

      {/* Actions */}
      <div
        style={{
          padding: "6px 10px 8px",
          display: "flex",
          gap: 5,
          borderTop: "1px solid #1e293b",
        }}
      >
        <button
          onClick={onLoad}
          style={{
            flex: 1,
            background: "#1d4ed8",
            color: "#fff",
            border: "none",
            borderRadius: 7,
            padding: "5px 0",
            fontSize: 11,
            fontWeight: 700,
            cursor: "pointer",
          }}
          title="Replace current canvas with this design"
        >
          Load
        </button>
        <button
          onClick={onAppend}
          style={{
            flex: 1,
            background: "#0f766e",
            color: "#fff",
            border: "none",
            borderRadius: 7,
            padding: "5px 0",
            fontSize: 11,
            fontWeight: 700,
            cursor: "pointer",
          }}
          title="Append this design to the right of the current canvas"
        >
          Append →
        </button>
        {canDelete && onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm(`Delete "${label}"?`)) onDelete();
            }}
            style={{
              background: "#1e293b",
              color: "#94a3b8",
              border: "1px solid #334155",
              borderRadius: 7,
              padding: "5px 7px",
              fontSize: 11,
              cursor: "pointer",
            }}
            title="Delete from library"
          >
            🗑
          </button>
        )}
      </div>
    </div>
  );
}

// ── Build project data from a starter template ────────────────────────────────
function templateToProject(t: StarterTemplate): any {
  return {
    type: "freeform",
    version: 2,
    rings: t.rings,
    scaleColors: t.scaleColors,
    geometry: {
      innerDiameter: 7.94,
      wireDiameter: 1.2,
      centerSpacing: 7.0,
      angleIn: 0,
      angleOut: 0,
    },
    scaleSettings: {
      scaleEnabled: true,
      // Default standard scale (matches the Freeform/Tuner defaults) so template
      // scales render as the proper almond/"leaf" shape WITH a visible mounting
      // hole — the previous 9.1mm-wide / 7.94mm-hole values made a too-narrow
      // scale whose hole filled almost the whole body.
      scaleHoleDiameter: 6.35,
      scaleWidth: 12.5,
      scaleHeight: 23.5,
      scaleShape: "leaf",
      scaleDrop: 11.0,
      scaleColor: "#aaaaaa",
      scaleCenterSpacing: 19.6,
      scaleGridOffsetX: 0,
      scaleGridOffsetY: 0,
      scaleHoleOffsetY: -6.2,
      scalePlaneZ: 0,
      scaleTipLiftDeg: 14,
      scaleRowClearanceZ: 1.2,
      scaleOnEveryCell: false,
      lockScaleHolesToRingCenters: true,
      scaleWeaveMode: "interlocked",
    },
    overlay: null,
    paletteAssignment: null,
    metadata: {
      page: "freeform",
      name: t.name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  };
}

// ── Panel ─────────────────────────────────────────────────────────────────────
type Tab = "my" | "starters";

export const ProjectLibraryPanel: React.FC<Props> = ({ onLoad, onClose }) => {
  const [tab, setTab] = useState<Tab>("my");
  const [search, setSearch] = useState("");
  const [projects, setProjects] = useState<LibraryProject[]>([]);
  const [imgConverterOpen, setImgConverterOpen] = useState(false);

  // Load index on mount and whenever tab changes to "my"
  useEffect(() => {
    if (tab === "my") setProjects(readIndex());
  }, [tab]);

  const filteredProjects = useMemo(() => {
    const q = search.toLowerCase();
    return projects.filter((p) => !q || p.name.toLowerCase().includes(q));
  }, [projects, search]);

  const filteredTemplates = useMemo(() => {
    const q = search.toLowerCase();
    return STARTER_TEMPLATES.filter(
      (t) =>
        !q ||
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.includes(q)),
    );
  }, [search]);

  const handleLoadProject = (id: string, mode: LoadMode) => {
    const data = readProject(id);
    if (!data) { alert("Could not load project data."); return; }
    if (mode === "replace" && !window.confirm("Replace current canvas with this design?")) return;
    onLoad(data, mode);
    onClose();
  };

  const handleLoadTemplate = (t: StarterTemplate, mode: LoadMode) => {
    if (mode === "replace" && !window.confirm(`Load "${t.name}" and replace current canvas?`)) return;
    onLoad(templateToProject(t), mode);
    onClose();
  };

  const handleDelete = (id: string) => {
    deleteProject(id);
    setProjects(readIndex());
  };

  return (
    <>
      {/* Panel */}
      <div
        style={{
          width: "min(920px, 96vw)",
          maxHeight: "88vh",
          background: "#0f172a",
          border: "1px solid #1e293b",
          borderRadius: 16,
          boxShadow: "0 24px 60px rgba(0,0,0,0.8)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 18px 12px",
            borderBottom: "1px solid #1e293b",
            flexShrink: 0,
          }}
        >
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#f1f5f9" }}>
              📚 Design Library
            </div>
            <div style={{ fontSize: 11, color: "#475569", marginTop: 1 }}>
              Load a saved design or start from a built-in template
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={() => setImgConverterOpen(true)}
              style={{
                background: "linear-gradient(135deg, #0d9488, #0369a1)",
                border: "none",
                borderRadius: 10,
                color: "#fff",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 700,
                padding: "8px 14px",
                whiteSpace: "nowrap",
                display: "flex",
                alignItems: "center",
                gap: 6,
                boxShadow: "0 2px 8px rgba(13,148,136,0.35)",
              }}
            >
              🖼️ Analyze design from image
            </button>
            <button
              onClick={onClose}
              style={{
                background: "transparent",
                border: "1px solid #334155",
                color: "#94a3b8",
                borderRadius: 8,
                width: 32,
                height: 32,
                fontSize: 16,
                cursor: "pointer",
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tab bar + search */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 18px",
            borderBottom: "1px solid #1e293b",
            flexShrink: 0,
          }}
        >
          {(["my", "starters"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: tab === t ? "#1d4ed8" : "#1e293b",
                color: tab === t ? "#fff" : "#94a3b8",
                border: "none",
                borderRadius: 8,
                padding: "5px 14px",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {t === "my"
                ? `My Designs${projects.length ? ` (${projects.length})` : ""}`
                : "Starter Templates"}
            </button>
          ))}

          <input
            type="text"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              marginLeft: "auto",
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: 8,
              color: "#e2e8f0",
              padding: "5px 10px",
              fontSize: 12,
              width: 180,
              outline: "none",
            }}
          />
        </div>

        {/* Card grid */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "14px 18px 18px",
          }}
        >
          {tab === "my" && (
            <>
              {filteredProjects.length === 0 ? (
                <div
                  style={{
                    textAlign: "center",
                    color: "#334155",
                    padding: "60px 20px",
                    fontSize: 14,
                  }}
                >
                  {search
                    ? "No designs match your search."
                    : "No saved designs yet — use the 💾 button to save your work."}
                </div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                    gap: 12,
                  }}
                >
                  {filteredProjects.map((p) => {
                    const data = readProject(p.id);
                    const ringCount = data?.rings?.length ?? 0;
                    const scaleCount = data?.scaleColors?.length ?? 0;
                    return (
                      <ProjectCard
                        key={p.id}
                        label={p.name}
                        thumbnail={p.thumbnail?.pngDataUrl ?? null}
                        ringCount={ringCount}
                        scaleCount={scaleCount}
                        date={formatDate(p.updatedAt)}
                        canDelete
                        onLoad={() => handleLoadProject(p.id, "replace")}
                        onAppend={() => handleLoadProject(p.id, "append")}
                        onDelete={() => handleDelete(p.id)}
                      />
                    );
                  })}
                </div>
              )}
            </>
          )}

          {tab === "starters" && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                gap: 12,
              }}
            >
              {filteredTemplates.map((t) => (
                <ProjectCard
                  key={t.id}
                  label={t.name}
                  description={t.description}
                  thumbNode={
                    <TemplateThumbnail rings={t.rings} scaleColors={t.scaleColors} />
                  }
                  ringCount={t.rings.length}
                  scaleCount={t.scaleColors.length}
                  canDelete={false}
                  onLoad={() => handleLoadTemplate(t, "replace")}
                  onAppend={() => handleLoadTemplate(t, "append")}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div
          style={{
            padding: "8px 18px",
            borderTop: "1px solid #1e293b",
            fontSize: 10,
            color: "#334155",
            flexShrink: 0,
          }}
        >
          <b style={{ color: "#475569" }}>Load</b> replaces the current canvas ·{" "}
          <b style={{ color: "#475569" }}>Append →</b> places the design to the right of your existing work
        </div>
      </div>

    {imgConverterOpen && (
      <ImageToDesignPanel
        onLoad={(data) => {
          setImgConverterOpen(false);
          onLoad(data, "replace");
          onClose();
        }}
        onClose={() => setImgConverterOpen(false)}
      />
    )}
  </>
  );
};

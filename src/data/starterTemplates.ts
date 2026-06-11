// src/data/starterTemplates.ts
// Built-in starter designs for the Design Library.
// All coordinates are in the freeform hex-grid (row, col).

export interface TemplateRing {
  row: number;
  col: number;
  cluster: number;
  color: string;
}

export interface StarterTemplate {
  id: string;
  name: string;
  description: string;
  tags: string[];
  rings: TemplateRing[];
}

// ── Generators ──────────────────────────────────────────────────────────────

function grid(rows: number, cols: number, color = "#aaaaaa"): TemplateRing[] {
  const out: TemplateRing[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      out.push({ row: r, col: c, cluster: 1, color });
  return out;
}

function stripes(rows: number, cols: number, colors: string[]): TemplateRing[] {
  const out: TemplateRing[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      out.push({ row: r, col: c, cluster: 1, color: colors[r % colors.length] });
  return out;
}

function diamond(radius: number, color = "#aaaaaa"): TemplateRing[] {
  const out: TemplateRing[] = [];
  const seen = new Set<string>();
  for (let r = -radius; r <= radius; r++) {
    for (let c = -radius; c <= radius; c++) {
      if (Math.abs(r) + Math.abs(c) <= radius) {
        const key = `${r + radius},${c + radius}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push({ row: r + radius, col: c + radius, cluster: 1, color });
        }
      }
    }
  }
  return out;
}

function chevron(rows: number, colsPerRow: number, colors: [string, string]): TemplateRing[] {
  const out: TemplateRing[] = [];
  for (let r = 0; r < rows; r++) {
    // Alternate stripe pairs every 2 rows → chevron feel
    const color = colors[Math.floor(r / 2) % 2];
    for (let c = 0; c < colsPerRow; c++)
      out.push({ row: r, col: c, cluster: 1, color });
  }
  return out;
}

// Rainbow row colors
const RAINBOW = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#a855f7"];

function rainbowRows(rows: number, cols: number): TemplateRing[] {
  return stripes(rows, cols, RAINBOW);
}

// ── Template catalog ─────────────────────────────────────────────────────────

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: "blank",
    name: "Blank Canvas",
    description: "Empty canvas with default ring settings — start fresh.",
    tags: ["blank", "starter"],
    rings: [],
  },
  {
    id: "patch-6x8",
    name: "Small Patch (6 × 8)",
    description: "48-ring rectangular patch — good for experimenting with ring geometry.",
    tags: ["patch", "rectangle", "starter"],
    rings: grid(6, 8, "#aaaaaa"),
  },
  {
    id: "bracelet-4x24",
    name: "Bracelet Strip (4 × 24)",
    description: "96-ring horizontal strip sized for a typical bracelet width.",
    tags: ["bracelet", "strip", "starter"],
    rings: grid(4, 24, "#aaaaaa"),
  },
  {
    id: "wide-patch-10x14",
    name: "Wide Fill (10 × 14)",
    description: "140-ring canvas — good base for image transfer.",
    tags: ["patch", "large", "fill"],
    rings: grid(10, 14, "#aaaaaa"),
  },
  {
    id: "diamond-r5",
    name: "Diamond (radius 5)",
    description: "Diamond-shaped ring arrangement — focal piece or medallion.",
    tags: ["diamond", "shape", "focal"],
    rings: diamond(5, "#888888"),
  },
  {
    id: "two-tone-stripe",
    name: "Two-Tone Stripe",
    description: "Silver and dark alternating row stripes — classic two-color weave.",
    tags: ["stripe", "two-color"],
    rings: stripes(8, 14, ["#c0c0c0", "#374151"]),
  },
  {
    id: "rainbow-rows",
    name: "Rainbow Rows",
    description: "Seven spectral colors, one per row — colorful starting point.",
    tags: ["rainbow", "color", "rows"],
    rings: rainbowRows(7, 14),
  },
  {
    id: "chevron-8x12",
    name: "Chevron Pattern",
    description: "Paired-row chevron in teal and charcoal.",
    tags: ["chevron", "pattern", "two-color"],
    rings: chevron(8, 12, ["#0e7490", "#1f2937"]),
  },
  {
    id: "border-frame-8x12",
    name: "Border Frame",
    description: "Hollow rectangle — ring border with empty center for custom fills.",
    tags: ["border", "frame", "hollow"],
    rings: (() => {
      const out: TemplateRing[] = [];
      const rows = 8, cols = 12;
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
          if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1)
            out.push({ row: r, col: c, cluster: 1, color: "#888888" });
      return out;
    })(),
  },
];

// src/components/BOMExport.ts
// Build a color BOM and export as CSV, PNG, or printable HTML (PDF via browser print)

export type RingLike = { colorHex?: string | null };

export type BOMMeta = {
  title?: string; // document title
  supplier?: string; // e.g., "TRL"
  ringSizeLabel?: string; // e.g., `5/16" (ID)`
  material?: string; // e.g., "Anodized Aluminum"
  packSize?: number; // rings per pack (half-pound ~ 1500 for 18g 5/16")
  background?: string; // PNG background color
  textColor?: string; // PNG text color
};

export type ColorSummary = {
  number: number; // 1,2,3,... used to match numbered map
  hex: string; // normalized hex
  count: number; // rings of this hex
  packs: number; // ceil(count/packSize)
};

const DEFAULTS: Required<BOMMeta> = {
  title: "Woven Rainbows — Color BOM",
  supplier: "TRL",
  ringSizeLabel: `5/16"`,
  material: "Anodized Aluminum",
  packSize: 1500,
  background: "#0b1220",
  textColor: "#e5e7eb",
};

// ----------------- core: summarize colors -----------------
export function summarizeByColor(
  rings: RingLike[],
  meta?: Partial<BOMMeta>,
): { rows: ColorSummary[]; total: number; meta: Required<BOMMeta> } {
  const m = { ...DEFAULTS, ...(meta || {}) };

  const map = new Map<string, number>();
  for (const r of rings) {
    const raw = (r.colorHex || "#ffffff").toString().trim();
    const hex = normalizeHex(raw);
    map.set(hex, (map.get(hex) || 0) + 1);
  }

  const entries = Array.from(map.entries())
    .map(([hex, count]) => ({ hex, count }))
    // stable, but predictable: sort by hex so numbering matches across runs
    .sort((a, b) => a.hex.localeCompare(b.hex));

  const rows: ColorSummary[] = entries.map((e, i) => ({
    number: i + 1,
    hex: e.hex,
    count: e.count,
    packs: Math.ceil(e.count / m.packSize),
  }));

  const total = rows.reduce((s, r) => s + r.count, 0);
  return { rows, total, meta: m };
}

function normalizeHex(h: string) {
  // allow "rgb(...)" or short hex; fallback to given
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(h)) {
    if (h.length === 4) {
      // #abc -> #aabbcc
      const [, a, b, c] = h;
      return `#${a}${a}${b}${b}${c}${c}`.toLowerCase();
    }
    return h.toLowerCase();
  }
  const rgb = h.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
  if (rgb) {
    const toHex = (n: string) =>
      Math.max(0, Math.min(255, parseInt(n, 10)))
        .toString(16)
        .padStart(2, "0");
    return `#${toHex(rgb[1])}${toHex(rgb[2])}${toHex(rgb[3])}`.toLowerCase();
  }
  return h;
}

// ----------------- CSV -----------------
export function exportBOMCsv(
  rings: RingLike[],
  meta?: Partial<BOMMeta>,
  filename = "freeform-bom.csv",
) {
  const { rows, total, meta: m } = summarizeByColor(rings, meta);
  const lines: string[] = [];
  lines.push(
    [
      "No.",
      "Color Hex",
      "Count",
      `Packs (${m.packSize})`,
      "Supplier",
      "Ring Size",
      "Material",
    ].join(","),
  );
  for (const r of rows) {
    lines.push(
      [
        r.number,
        r.hex,
        r.count,
        r.packs,
        m.supplier,
        m.ringSizeLabel,
        m.material,
      ].join(","),
    );
  }
  lines.push(
    ["TOTAL", "", total, Math.ceil(total / m.packSize), "", "", ""].join(","),
  );
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  downloadBlob(filename, blob);
}

// ----------------- PNG (drawn on canvas, no external libs) -----------------
export async function exportBOMPng(
  rings: RingLike[],
  meta?: Partial<BOMMeta>,
  filename = "freeform-bom.png",
) {
  const { rows, total, meta: m } = summarizeByColor(rings, meta);

  // Layout
  const scale = 2; // HiDPI
  const padding = 28;
  const rowH = 32;
  const headerH = 90;
  const footerH = 40;
  const swatch = 18;

  const width = 880;
  const height = headerH + rows.length * rowH + footerH;

  const cvs = document.createElement("canvas");
  cvs.width = width * scale;
  cvs.height = height * scale;
  cvs.style.width = `${width}px`;
  cvs.style.height = `${height}px`;
  const ctx = cvs.getContext("2d")!;
  ctx.scale(scale, scale);

  // bg
  ctx.fillStyle = m.background;
  ctx.fillRect(0, 0, width, height);

  // title
  ctx.fillStyle = m.textColor;
  ctx.font =
    "bold 20px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
  ctx.fillText(m.title, padding, padding + 8);

  // meta line
  ctx.font =
    "12px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
  const sub = `Supplier: ${m.supplier}   •   Ring: ${m.ringSizeLabel}   •   Material: ${m.material}   •   Pack: ${m.packSize}`;
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fillText(sub, padding, padding + 30);

  // header row
  const y0 = headerH - 18;
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  roundRect(ctx, padding - 6, y0, width - padding * 2 + 12, 28, 8, true, false);
  ctx.fillStyle = m.textColor;
  ctx.font =
    "bold 12px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
  drawRow(ctx, padding, y0 + 20, swatch, {
    num: "No.",
    color: "Color",
    hex: "Hex",
    count: "Count",
    packs: `Packs (${m.packSize})`,
  });

  // rows
  ctx.font =
    "12px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
  let y = headerH + 4;
  rows.forEach((r, i) => {
    // alternating row bg
    if (i % 2 === 0) {
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      roundRect(
        ctx,
        padding - 6,
        y - 18,
        width - padding * 2 + 12,
        28,
        6,
        true,
        false,
      );
    }
    // swatch
    ctx.fillStyle = r.hex;
    roundRect(
      ctx,
      padding + 44,
      y - swatch + 8,
      swatch,
      swatch,
      4,
      true,
      false,
    );

    ctx.fillStyle = m.textColor;
    drawRow(ctx, padding, y, swatch, {
      num: String(r.number),
      color: "", // swatch only
      hex: r.hex.toUpperCase(),
      count: String(r.count),
      packs: String(r.packs),
    });
    y += rowH;
  });

  // footer totals
  ctx.font =
    "bold 13px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
  ctx.fillStyle = m.textColor;
  ctx.fillText(`TOTAL RINGS: ${total}`, padding, height - 12);

  // download
  await new Promise<void>((res) => cvs.toBlob(() => res(), "image/png"));
  cvs.toBlob((blob) => {
    if (blob) downloadBlob(filename, blob);
  }, "image/png");
}

// ----------------- PRINT (for PDF via system dialog) -----------------
export function openBOMPrintWindow(
  rings: RingLike[],
  meta?: Partial<BOMMeta>,
  docTitle = "Color BOM",
) {
  const { rows, total, meta: m } = summarizeByColor(rings, meta);

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(docTitle)}</title>
  <style>
    body{font:14px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial; margin:24px; color:#0b1324;}
    h1{font-size:20px;margin:0 0 4px 0}
    .sub{color:#475569;margin-bottom:14px}
    table{border-collapse:collapse; width:100%;}
    th,td{border:1px solid #e5e7eb; padding:8px; text-align:left}
    th{background:#f1f5f9}
    .sw{display:inline-block;width:14px;height:14px;border-radius:3px;border:1px solid #000; vertical-align:middle;margin-right:8px}
    .tot{margin-top:10px;font-weight:700}
    @media print { .no-print { display:none } }
  </style>
</head>
<body>
  <h1>${escapeHtml(m.title)}</h1>
  <div class="sub">
    Supplier: ${escapeHtml(m.supplier)} &nbsp; • &nbsp;
    Ring: ${escapeHtml(m.ringSizeLabel)} &nbsp; • &nbsp;
    Material: ${escapeHtml(m.material)} &nbsp; • &nbsp;
    Pack: ${m.packSize}
  </div>
  <table>
    <thead><tr>
      <th>No.</th><th>Color</th><th>Hex</th><th>Count</th><th>Packs (${m.packSize})</th>
    </tr></thead>
    <tbody>
      ${rows
        .map(
          (r) =>
            `<tr>
              <td>${r.number}</td>
              <td><span class="sw" style="background:${r.hex}"></span></td>
              <td>${r.hex.toUpperCase()}</td>
              <td>${r.count}</td>
              <td>${r.packs}</td>
            </tr>`,
        )
        .join("")}
    </tbody>
  </table>
  <div class="tot">TOTAL RINGS: ${total} &nbsp; • &nbsp; TOTAL PACKS (${m.packSize}): ${Math.ceil(
    total / m.packSize,
  )}</div>
  <div class="no-print" style="margin-top:14px">
    <button onclick="window.print()">Print (Save as PDF)</button>
  </div>
  <script>window.print()</script>
</body>
</html>`;

  const w = window.open(
    "",
    "_blank",
    "noopener,noreferrer,width=920,height=700",
  );
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}

// --------------- utilities ---------------
function drawRow(
  ctx: CanvasRenderingContext2D,
  x: number,
  baselineY: number,
  swatch: number,
  data: {
    num: string;
    color: string;
    hex: string;
    count: string;
    packs: string;
  },
) {
  const colX = {
    num: x,
    sw: x + 44,
    hex: x + 44 + swatch + 16 + 140, // after swatch + a little padding + “Color” col width
    count: x + 44 + swatch + 16 + 360,
    packs: x + 44 + swatch + 16 + 460,
  };
  ctx.fillText(data.num, colX.num, baselineY);
  if (data.color) ctx.fillText(data.color, colX.sw, baselineY);
  ctx.fillText(data.hex, colX.hex, baselineY);
  ctx.fillText(data.count, colX.count, baselineY);
  ctx.fillText(data.packs, colX.packs, baselineY);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: boolean,
  stroke: boolean,
) {
  if (r > w / 2) r = w / 2;
  if (r > h / 2) r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

function downloadBlob(filename: string, data: Blob) {
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function escapeHtml(s: string) {
  // Order matters: & first to avoid double-escaping
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

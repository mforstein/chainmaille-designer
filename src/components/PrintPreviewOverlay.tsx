// src/components/PrintPreviewOverlay.tsx
import React from "react";

interface UsageRow {
  supplier: string;
  supplierId: string;
  name: string;
  hex: string;
  count: number;
  packs: number;
  swg?: string;
  id?: string;
  ar?: string;
}

interface Props {
  pagesX: number;
  pagesY: number;
  usageRows: UsageRow[];
  totalPacks: number;
  printPages: string[]; // ✅ images of sliced pages
  onCancel: () => void;
}

export default function PrintPreviewOverlay({
  pagesX,
  pagesY,
  usageRows,
  totalPacks,
  printPages,
  onCancel,
}: Props) {
  // PRINT HANDLER — includes BOM
  const handlePrint = () => {
    const printWin = window.open("", "_blank");
    if (!printWin) return;
    const doc = printWin.document;

    doc.write(`
<html>
<head>
  <title>Chainmail Print</title>
  <style>
    body { background: white; color: black; }
    .page { background: white; }
  </style>
</head>
<body>
`);

    // --- Cover Page ---
    doc.write(`<h1>Chainmail Project</h1>`);
    doc.write(`<p>Date: ${new Date().toLocaleDateString()}</p>`);
    doc.write(`<div style="page-break-after: always;"></div>`);

    // --- Tiled Pages (all printPages slices) ---
    printPages.forEach((url, i) => {
      doc.write(`
        <div class="page">
          <img src="${url}" style="max-width:100%;"/>
          <div>Page ${i + 1} of ${printPages.length}</div>
        </div>
        <div style="page-break-after: always;"></div>
      `);
    });

    // --- Bill of Materials Page ---
    doc.write("<h2>Bill of Materials</h2>");
    doc.write(
      "<table border='1' cellspacing='0' cellpadding='4' style='border-collapse:collapse;width:100%;'>",
    );
    doc.write(
      "<tr><th>Supplier</th><th>Color</th><th>Rings</th><th>Packs</th></tr>",
    );
    usageRows.forEach((row) => {
      doc.write(`
        <tr>
          <td>${row.supplier}</td>
          <td>${row.name}</td>
          <td align="right">${row.count}</td>
          <td align="right">${row.packs}</td>
        </tr>
      `);
    });
    doc.write(`</table><p><strong>Total Packs: ${totalPacks}</strong></p>`);

    doc.write("</body></html>");
    doc.close();

    printWin.focus();
    printWin.print();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white p-4 rounded-lg text-black max-h-[90%] overflow-auto w-[90%]">
        <h2 className="text-lg font-bold mb-4">Print Preview (8.5" × 11")</h2>

        {/* Grid preview of sliced images */}
        <div
          className="grid gap-2 justify-center"
          style={{ gridTemplateColumns: `repeat(${pagesX}, auto)` }}
        >
          {printPages.map((url, i) => (
            <div
              key={i}
              className="border border-black flex items-center justify-center w-32 h-40 bg-gray-100 overflow-hidden"
            >
              <img
                src={url}
                alt={`Page ${i + 1}`}
                className="object-contain w-full h-full"
              />
            </div>
          ))}
        </div>

        {/* BOM summary (preview + will also be printed) */}
        <div className="mt-6">
          <h3 className="font-semibold text-base mb-2">Bill of Materials</h3>
          <table className="w-full border border-black text-sm">
            <thead>
              <tr className="bg-gray-200">
                <th className="border px-2 py-1 text-left">Supplier</th>
                <th className="border px-2 py-1 text-left">Color</th>
                <th className="border px-2 py-1 text-right">Rings</th>
                <th className="border px-2 py-1 text-right">Packs</th>
              </tr>
            </thead>
            <tbody>
              {usageRows.map((row, i) => (
                <tr key={i}>
                  <td className="border px-2 py-1">{row.supplier}</td>
                  <td className="border px-2 py-1">{row.name}</td>
                  <td className="border px-2 py-1 text-right">{row.count}</td>
                  <td className="border px-2 py-1 text-right">{row.packs}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-right mt-2 font-semibold">
            Total Packs: {totalPacks}
          </div>
        </div>

        {/* Controls */}
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onCancel}
            className="px-3 py-1 rounded bg-gray-700 text-white"
          >
            Cancel
          </button>
          <button
            onClick={handlePrint}
            className="px-3 py-1 rounded bg-blue-700 text-white"
          >
            Print
          </button>
        </div>
      </div>
    </div>
  );
}

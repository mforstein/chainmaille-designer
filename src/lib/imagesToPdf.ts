// ======================================================
// src/lib/imagesToPdf.ts
// Turn one or more raster images (PNG/JPEG data-URLs or blob URLs) into a
// multi-page PDF Blob. Each image becomes its own page, sized to the image.
//
// Used to replace browser `window.print()` flows, which don't work in the
// Android WebView — we generate the PDF ourselves and hand it to saveOrShare.
// ======================================================

import { PDFDocument } from "pdf-lib";

async function urlToBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  return new Uint8Array(await res.arrayBuffer());
}

function isJpeg(url: string): boolean {
  return /^data:image\/jpe?g/i.test(url) || /\.jpe?g($|\?)/i.test(url);
}

/** Build a PDF (one page per image) and return it as a Blob. */
export async function imagesToPdf(imageUrls: string[]): Promise<Blob> {
  const pdf = await PDFDocument.create();

  for (const url of imageUrls) {
    const bytes = await urlToBytes(url);
    const img = isJpeg(url) ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);
    const page = pdf.addPage([img.width, img.height]);
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  }

  const out = await pdf.save();
  return new Blob([out as BlobPart], { type: "application/pdf" });
}

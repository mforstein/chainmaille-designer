// ======================================================
// src/lib/saveOrShare.ts
// Cross-platform file "save/export" helper.
//
// Web  → classic anchor download (<a download>).
// Native (Android/iOS via Capacitor) → write the file to the app's
//   Cache dir with @capacitor/filesystem, then open the native share/save
//   sheet with @capacitor/share so the user can save to Files / Drive / etc.
//
// The Android System WebView silently ignores `<a download>` + blob: URLs,
// so every export that relied on the anchor trick did nothing on Android.
// Routing all of them through this helper fixes save, the PDF/CSV/BOM
// exports, and the 3D (GLB/STL) exports in one place.
// ======================================================

import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

/** Read a Blob as a base64 string (no data: prefix), for Filesystem.writeFile. */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
    reader.onload = () => {
      const result = String(reader.result || "");
      // result is "data:<mime>;base64,XXXX" — strip the prefix.
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}

/** Web-only anchor download. */
function webDownload(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4_000);
}

/**
 * Save or share a generated file.
 * On web this downloads; on native it writes to disk and opens the share sheet.
 * Returns true if a native share sheet was shown (so callers can suppress any
 * web-only fallback UI), false if it used the web download path.
 */
export async function saveOrShare(filename: string, blob: Blob): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) {
    webDownload(filename, blob);
    return false;
  }

  // Native: write to Cache, then share the file URI.
  const base64 = await blobToBase64(blob);
  const written = await Filesystem.writeFile({
    path: filename,
    data: base64,
    directory: Directory.Cache,
  });

  await Share.share({
    title: filename,
    text: filename,
    url: written.uri,
  });
  return true;
}

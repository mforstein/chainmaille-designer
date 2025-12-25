// ======================================================
// src/components/ProjectSaveLoadButtons.tsx
// ======================================================

import React, { useRef } from "react";

type MaybePromise<T> = T | Promise<T>;

interface Props {
  onSave: () => MaybePromise<any>;
  onLoad: (data: any) => void;
  defaultFileName?: string;
}

const btnStyle: React.CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.08)",
  fontSize: 20,
  cursor: "pointer",
  background: "#0f172a",
  color: "#e5e7eb",
  boxShadow: "0 6px 18px rgba(0,0,0,0.25)",
};

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const iOSUA = /iPad|iPhone|iPod/i.test(ua);
  const iPadOS =
    (navigator as any).platform === "MacIntel" &&
    (navigator as any).maxTouchPoints > 1;
  return iOSUA || iPadOS;
}

function ensureJsonFilename(name: string): string {
  const trimmed = (name || "").trim();
  if (!trimmed) return "chainmail-project.json";
  return trimmed.toLowerCase().endsWith(".json") ? trimmed : `${trimmed}.json`;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  // target helps some iOS/Safari versions actually treat it as a download
  a.target = "_self";

  document.body.appendChild(a);
  a.click();
  a.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 4_000);
}

async function shareOrDownloadJson(payload: any, filename: string) {
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json" });

  const iOS = isIOS();
  const navAny = navigator as any;

  // If you're on iOS over http://<LAN-IP>, file sharing is usually disabled.
  // (You'll see share "Options: PDF/Web Archive" like your screenshot.)
  if (iOS && typeof window !== "undefined" && !window.isSecureContext) {
    // Don’t block; just inform once per click.
    alert(
      "iPad tip: Sharing a .json file usually requires HTTPS (secure context). " +
        "On http://192.168.x.x Safari often shares a webpage instead of a file.",
    );
  }

  // --- iOS: try Share Sheet with FILES first ---
  if (iOS && typeof navAny?.share === "function" && typeof File !== "undefined") {
    const file = new File([blob], filename, { type: "application/json" });

    try {
      // Try file-sharing even if canShare is missing/false
      await navAny.share({
        title: filename,
        files: [file],
        // adding text helps some share targets show "Save to Files"
        text: "Chainmail project file",
      });
      return; // ✅ success
    } catch (err) {
      // fall through to download attempts
      console.warn("iOS share(files) failed, falling back:", err);
    }
  }

  // --- Next best: attempt direct download (works on many Safari versions now) ---
  try {
    triggerDownload(blob, filename);
    return;
  } catch (err) {
    console.warn("Download attempt failed, falling back:", err);
  }

  // --- Last resort: open the blob in a new tab (user can Share manually) ---
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 15_000);
}

export default function ProjectSaveLoadButtons({
  onSave,
  onLoad,
  defaultFileName = "chainmail-project",
}: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleSaveClick = () => {
    try {
      const suggestedName = `${defaultFileName}-${new Date()
        .toISOString()
        .slice(0, 10)}`;
      const fileName = window.prompt("Save project as:", suggestedName);
      if (!fileName) return;

      const finalName = ensureJsonFilename(fileName);

      // IMPORTANT: must be sync on iOS (user gesture stack)
      const maybePayload = onSave();

      if (maybePayload && typeof (maybePayload as any).then === "function") {
        if (isIOS()) {
          alert(
            "On iPad, saving must be synchronous. Update onSave() to return the payload immediately (no await).",
          );
          return;
        }

        (maybePayload as Promise<any>)
          .then((payload) => shareOrDownloadJson(payload, finalName))
          .catch((err) => {
            console.error("❌ Save failed:", err);
            alert("Failed to save project.");
          });
        return;
      }

      void shareOrDownloadJson(maybePayload, finalName);
    } catch (err) {
      console.error("❌ Save failed:", err);
      alert("Failed to save project.");
    }
  };

  const handleLoadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const json = JSON.parse(text);
      onLoad(json);
    } catch (err) {
      console.error("❌ Load failed:", err);
      alert("Invalid or corrupted project file.");
    } finally {
      e.currentTarget.value = "";
    }
  };

  return (
    <>
      <button
        type="button"
        style={btnStyle}
        title="Save Project"
        onClick={(e) => {
          e.stopPropagation();
          handleSaveClick();
        }}
      >
        💾
      </button>

      <button
        type="button"
        style={btnStyle}
        title="Load Project"
        onClick={(e) => {
          e.stopPropagation();
          handleLoadClick();
        }}
      >
        📂
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
    </>
  );
}
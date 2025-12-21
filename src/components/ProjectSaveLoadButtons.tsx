import React, { useRef } from "react";

type MaybePromise<T> = T | Promise<T>;

interface Props {
  /**
   * Return the JSON-serializable project payload.
   * (We handle the file prompt + download here.)
   */
  onSave: () => MaybePromise<any>;

  /** Receive parsed JSON payload from a chosen file. */
  onLoad: (data: any) => void;

  /** Optional default filename (without .json). */
  defaultFileName?: string;
}

const btn: React.CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.08)",
  fontSize: 20,
  cursor: "pointer",
  background: "#0f172a",
  color: "#e5e7eb",
  boxShadow: "0 6px 18px rgba(0,0,0,.25)",
};

export default function ProjectSaveLoadButtons({
  onSave,
  onLoad,
  defaultFileName = "chainmail-project",
}: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const doSave = async () => {
    try {
      const suggested = `${defaultFileName}-${new Date()
        .toISOString()
        .slice(0, 10)}`;

      const name = window.prompt("Save project as:", suggested);
      if (!name) return;

      const payload = await onSave();
      const json = JSON.stringify(payload, null, 2);

      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = name.toLowerCase().endsWith(".json") ? name : `${name}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("❌ Save failed:", err);
      alert("Failed to save project.");
    }
  };

  const doLoad = () => {
    fileInputRef.current?.click();
  };

  return (
    <>
      <button
        style={btn}
        title="Save Project"
        onClick={(e) => {
          e.stopPropagation();
          doSave();
        }}
      >
        💾
      </button>

      <button
        style={btn}
        title="Load Project"
        onClick={(e) => {
          e.stopPropagation();
          doLoad();
        }}
      >
        📂
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: "none" }}
        onChange={async (e) => {
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
            // allow loading the same file twice
            e.currentTarget.value = "";
          }
        }}
      />
    </>
  );
}
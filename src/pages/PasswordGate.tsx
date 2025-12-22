import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";

export default function PasswordGate() {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const location = useLocation();

  const redirect =
    (location.state as any)?.redirect || "/workspace";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = input.trim().toUpperCase();

    if (code === "ERIN50") {
      localStorage.setItem("designerAuth", "true");
      localStorage.setItem("freeformAuth", "true");
      localStorage.setItem("erin2DAuth", "true");

      navigate(redirect, { replace: true });
    } else {
      setError("Incorrect password. Please try again.");
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background: "#0F1115",
        color: "#E5E7EB",
        flexDirection: "column",
        padding: 24,
      }}
    >
      <h1 style={{ marginBottom: 8 }}>
        Woven Rainbows by Erin
      </h1>

      <p style={{ color: "#9CA3AF", marginBottom: 24 }}>
        Enter password to access the designer tools
      </p>

      <form
        onSubmit={handleSubmit}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          width: 280,
        }}
      >
        <input
          type="password"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          autoFocus
          placeholder="Enter password"
          style={{
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid #374151",
            background: "#1F2937",
            color: "white",
          }}
        />

        <button
          type="submit"
          style={{
            background: "#2563EB",
            border: "none",
            borderRadius: 8,
            color: "white",
            padding: "10px",
            fontWeight: "bold",
            cursor: "pointer",
          }}
        >
          Enter
        </button>

        {error && (
          <p style={{ color: "#F87171" }}>
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";

export default function PasswordGate() {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const location = useLocation();

  console.log("🔍 Redirect state:", location.state);

  // default redirect (only used for ERIN50 blog and 2D access)
  const redirect = location.state?.redirect || "/erin2d";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = input.trim().toUpperCase();

    // ================================
    // 💡 PASSWORD ROUTING LOGIC (fixed)
    // ================================

    if (code === "ERIN50") {
      localStorage.setItem("erin2DAuth", "true");
      navigate(redirect);     // blog OR erin2d
    } 
    else if (code === "3DMODE") {
      localStorage.setItem("designerAuth", "true");
      navigate("/designer");  // 3D Builder
    } 
    else if (code === "FFMODE") {
      localStorage.setItem("freeformAuth", "true");
      navigate("/freeform");  // FREEFORM MODE! (fixed)
    } 
    else {
      setError("Incorrect password. Please try again.");
    }
  };

  // ================================
  // HEADER TEXT FIX (adds FREEFORM)
  // ================================
  const isBlogAccess = redirect === "/wovenrainbowsbyerin/blog";
  const isFreeform = redirect === "/freeform";

  const title = isBlogAccess
    ? "Woven Rainbows Blog Access"
    : isFreeform
    ? "Freeform Chainmail Mode Access"
    : "Woven Rainbows Designer Access";

  const subtitle = isBlogAccess
    ? "Please enter your password to view Erin’s Studio Blog."
    : isFreeform
    ? "Please enter your password to access the Freeform Chainmail Designer."
    : "Please enter your password to access the Chainmail Designer.";

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
      }}
    >
      <h1 style={{ marginBottom: 8 }}>{title}</h1>

      <p style={{ color: "#9CA3AF", marginBottom: 24 }}>
        {subtitle}
      </p>

      <form
        onSubmit={handleSubmit}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
          width: 280,
        }}
      >
        <input
          type="password"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Enter password"
          style={{
            width: "100%",
            padding: "8px 12px",
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
            padding: "8px 16px",
            cursor: "pointer",
            fontWeight: "bold",
          }}
        >
          Enter
        </button>

        {error && (
          <p style={{ color: "#F87171", marginTop: 8 }}>{error}</p>
        )}
      </form>
    </div>
  );
}
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function PasswordGate() {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (input.trim().toUpperCase() === "ERIN50") {
      // Save session so Erin doesn’t have to re-enter password
      localStorage.setItem("designerAuth", "true");
      navigate("/designer");
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
      }}
    >
      <h1 style={{ marginBottom: 8 }}>Woven Rainbows Designer Access</h1>
      <p style={{ color: "#9CA3AF", marginBottom: 24 }}>
        Please enter your password to access the Chainmail Designer.
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
        {error && <p style={{ color: "#F87171", marginTop: 8 }}>{error}</p>}
      </form>
    </div>
  );
}
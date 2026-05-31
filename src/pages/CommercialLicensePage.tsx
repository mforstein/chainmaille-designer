import React from "react";
import { Link } from "react-router-dom";

const section: React.CSSProperties = { marginBottom: 20 };
const h3: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: "#f9fafb", marginBottom: 6 };
const p: React.CSSProperties = { color: "#9ca3af", lineHeight: 1.7, fontSize: 14 };

export default function CommercialLicensePage() {
  return (
    <div style={{ minHeight: "100vh", background: "#0b0f1a", color: "#e5e7eb", fontFamily: "system-ui, sans-serif", padding: "48px 24px 80px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <Link to="/pricing" style={{ color: "#6b7280", fontSize: 13, textDecoration: "none" }}>← Back to Pricing</Link>

        <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "24px 0 4px" }}>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: "#f9fafb", margin: 0 }}>Commercial Use License</h1>
          <span style={{ background: "#b45309", color: "#fff", fontSize: 11, fontWeight: 800, padding: "3px 10px", borderRadius: 20, textTransform: "uppercase", letterSpacing: 0.5 }}>Studio</span>
        </div>
        <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 36 }}>Effective Date: May 4, 2026 · Woven Rainbows by Erin</p>

        <div style={{ background: "#1c1917", border: "1px solid #b45309", borderRadius: 10, padding: "14px 18px", marginBottom: 32 }}>
          <p style={{ ...p, color: "#fbbf24", margin: 0 }}>
            This license applies to <strong>Studio tier subscribers</strong> only. Maker and Crafter subscribers
            may use the application for personal use and non-commercial pattern creation.
          </p>
        </div>

        <div style={section}>
          <h3 style={h3}>What Is Permitted (Studio Tier)</h3>
          <p style={p}>
            Studio tier subscribers are granted a commercial use license that permits:
          </p>
          <ul style={{ ...p, paddingLeft: 20, marginTop: 8 }}>
            <li>Selling physical chainmaille and scalemail items made using patterns designed with this application</li>
            <li>Publishing and selling patterns (PDF, print, or digital) created with the application's export tools</li>
            <li>Using designs in a professional or business context, including craft fairs, online shops (Etsy, Shopify, etc.), and commission work</li>
            <li>Teaching classes or workshops using patterns created with the application</li>
            <li>Using the application's output in promotional materials for your business</li>
          </ul>
        </div>

        <div style={section}>
          <h3 style={h3}>What Is Not Permitted</h3>
          <p style={p}>
            Regardless of subscription tier, the following are not permitted:
          </p>
          <ul style={{ ...p, paddingLeft: 20, marginTop: 8 }}>
            <li>Redistributing or reselling the application software itself</li>
            <li>Creating a competing chainmaille design application using this application's code or assets</li>
            <li>Sharing your account credentials to give others access to paid features</li>
            <li>Claiming the application or its underlying design tools as your own creation</li>
          </ul>
        </div>

        <div style={section}>
          <h3 style={h3}>Attribution</h3>
          <p style={p}>
            Attribution to Chainmail Studio / Woven Rainbows by Erin is appreciated but not required
            when selling items or patterns made using this application.
          </p>
        </div>

        <div style={section}>
          <h3 style={h3}>License Duration</h3>
          <p style={p}>
            This commercial use license is valid for the duration of an active Studio tier subscription.
            If your subscription lapses, commercial use rights are suspended until the subscription is renewed.
            Existing items you have already produced and sold prior to lapsing are not affected.
          </p>
        </div>

        <div style={section}>
          <h3 style={h3}>Personal Use Tiers (Maker & Crafter)</h3>
          <p style={p}>
            Maker and Crafter subscribers may use the application to create designs for personal enjoyment,
            gifts, and non-commercial purposes. Incidental sales (e.g., selling a piece to a friend) are
            permitted. Regular commercial activity — maintaining an Etsy shop, selling at craft fairs,
            taking commissions — requires a Studio subscription.
          </p>
        </div>

        <div style={section}>
          <h3 style={h3}>Upgrade to Studio</h3>
          <p style={{ ...p, marginBottom: 12 }}>
            Ready to sell your work commercially?
          </p>
          <Link
            to="/pricing"
            style={{
              display: "inline-block",
              padding: "10px 24px",
              background: "#b45309",
              color: "#fff",
              borderRadius: 10,
              fontWeight: 700,
              fontSize: 14,
              textDecoration: "none",
            }}
          >
            View Studio Plan — $9.99/mo
          </Link>
        </div>

        <div style={section}>
          <h3 style={h3}>Questions</h3>
          <p style={p}>
            <a href="mailto:micahforstein@gmail.com" style={{ color: "#7c3aed" }}>micahforstein@gmail.com</a>
          </p>
        </div>
      </div>
    </div>
  );
}

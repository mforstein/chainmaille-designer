import React from "react";
import { Link } from "react-router-dom";

const section: React.CSSProperties = { marginBottom: 20 };
const h3: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: "#f9fafb", marginBottom: 6 };
const p: React.CSSProperties = { color: "#9ca3af", lineHeight: 1.7, fontSize: 14 };

export default function EulaPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#0b0f1a", color: "#e5e7eb", fontFamily: "system-ui, sans-serif", padding: "48px 24px 80px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <Link to="/pricing" style={{ color: "#6b7280", fontSize: 13, textDecoration: "none" }}>← Back to Pricing</Link>

        <h1 style={{ fontSize: 28, fontWeight: 900, color: "#f9fafb", margin: "24px 0 4px" }}>End User License Agreement</h1>
        <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 36 }}>Effective Date: May 4, 2026 · Chainmaille Designer by Woven Rainbows by Erin</p>

        <div style={section}>
          <p style={p}>
            This End User License Agreement ("Agreement") is a legal agreement between you ("User") and
            Woven Rainbows by Erin / Chainmaille Designer ("Developer"). By creating an account or using the
            application, you agree to be bound by this Agreement.
          </p>
        </div>

        <div style={section}>
          <h3 style={h3}>1. License Grant</h3>
          <p style={p}>
            Subject to your compliance with this Agreement and payment of any applicable subscription fees,
            Developer grants you a limited, non-exclusive, non-transferable, revocable license to access and
            use the Chainmaille Designer application for your personal or business purposes as permitted by
            your subscription tier.
          </p>
        </div>

        <div style={section}>
          <h3 style={h3}>2. Restrictions</h3>
          <p style={p}>
            You may not: (a) reverse engineer, decompile, or disassemble the application; (b) copy, modify,
            or create derivative works of the application; (c) sublicense, sell, resell, or redistribute
            access to the application; (d) use the application to build a competing product or service;
            (e) circumvent or disable any access controls or subscription gates.
          </p>
        </div>

        <div style={section}>
          <h3 style={h3}>3. Subscription & Payments</h3>
          <p style={p}>
            Access to certain features requires a paid subscription. Subscriptions are billed monthly and
            renew automatically. You may cancel at any time — cancellation takes effect at the end of the
            current billing period. No refunds are issued for partial months.
          </p>
        </div>

        <div style={section}>
          <h3 style={h3}>4. User Content & Designs</h3>
          <p style={p}>
            You retain ownership of any designs, patterns, and content you create using the application.
            Developer does not claim rights to your designs. You grant Developer a limited license to
            store and display your content solely as necessary to provide the service.
          </p>
        </div>

        <div style={section}>
          <h3 style={h3}>5. Commercial Use</h3>
          <p style={p}>
            Personal use is permitted on all paid tiers. Commercial use — including selling physical items
            made from designs created with the application, publishing patterns for sale, or using designs
            in a business context — requires a Studio tier subscription. See the{" "}
            <Link to="/commercial-license" style={{ color: "#b45309" }}>Commercial Use License</Link> for details.
          </p>
        </div>

        <div style={section}>
          <h3 style={h3}>6. Disclaimer of Warranty</h3>
          <p style={p}>
            The application is provided "AS IS" without warranties of any kind, express or implied.
            Developer does not warrant that the application will be uninterrupted, error-free, or free
            of viruses or other harmful components.
          </p>
        </div>

        <div style={section}>
          <h3 style={h3}>7. Limitation of Liability</h3>
          <p style={p}>
            To the fullest extent permitted by applicable law, Developer shall not be liable for any
            indirect, incidental, special, consequential, or punitive damages arising from your use of
            the application, including loss of data or profits.
          </p>
        </div>

        <div style={section}>
          <h3 style={h3}>8. Termination</h3>
          <p style={p}>
            Developer may suspend or terminate your account if you violate this Agreement. Upon
            termination, your license to use the application immediately ceases.
          </p>
        </div>

        <div style={section}>
          <h3 style={h3}>9. Governing Law</h3>
          <p style={p}>
            This Agreement is governed by the laws of the United States. Any disputes shall be resolved
            in the courts of competent jurisdiction.
          </p>
        </div>

        <div style={section}>
          <h3 style={h3}>10. Contact</h3>
          <p style={p}>
            Questions about this Agreement?{" "}
            <a href="mailto:micahforstein@gmail.com" style={{ color: "#7c3aed" }}>micahforstein@gmail.com</a>
          </p>
        </div>
      </div>
    </div>
  );
}

import React from "react";
import { Link } from "react-router-dom";
import { analyticsOptedOut, setAnalyticsOptOut } from "../lib/analytics";

const section: React.CSSProperties = { marginBottom: 20 };
const h3: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: "#f9fafb", marginBottom: 6 };
const p: React.CSSProperties = { color: "#9ca3af", lineHeight: 1.7, fontSize: 14 };
const ul: React.CSSProperties = { color: "#9ca3af", lineHeight: 1.7, fontSize: 14, paddingLeft: 20, marginTop: 0 };

// Live opt-out control for first-party analytics. Reads and writes the same
// localStorage flag the analytics module checks, so toggling takes effect
// immediately (no reload, no account required).
function AnalyticsOptOut() {
  const [optedOut, setOptedOut] = React.useState<boolean>(() => analyticsOptedOut());
  const toggle = () => {
    const next = !optedOut;
    setAnalyticsOptOut(next);
    setOptedOut(next);
  };
  return (
    <div
      style={{
        marginTop: 12,
        padding: "14px 16px",
        background: "#0f1623",
        border: "1px solid #1f2937",
        borderRadius: 10,
        display: "flex",
        alignItems: "center",
        gap: 14,
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ color: "#f9fafb", fontWeight: 700, fontSize: 14 }}>
          {optedOut ? "Usage analytics are OFF" : "Usage analytics are ON"}
        </div>
        <div style={{ color: "#9ca3af", fontSize: 13, marginTop: 2 }}>
          {optedOut
            ? "We are not collecting anonymous usage events from this device."
            : "We collect anonymous, first-party usage events on this device to improve the app."}
        </div>
      </div>
      <button
        onClick={toggle}
        style={{
          flexShrink: 0,
          background: optedOut ? "#7c3aed" : "#1e293b",
          color: optedOut ? "#fff" : "#cbd5e1",
          border: "1px solid #334155",
          borderRadius: 8,
          padding: "9px 16px",
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        {optedOut ? "Turn analytics on" : "Opt out of analytics"}
      </button>
    </div>
  );
}

export default function PrivacyPolicy() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0b0f1a",
        color: "#e5e7eb",
        fontFamily: "system-ui, sans-serif",
        padding: "48px 24px 80px",
      }}
    >
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <Link
          to="/wovenrainbowsbyerin"
          style={{ color: "#6b7280", fontSize: 13, textDecoration: "none" }}
        >
          ← Back to Home
        </Link>

        <h1 style={{ fontSize: 28, fontWeight: 900, color: "#f9fafb", margin: "24px 0 4px" }}>
          Privacy Policy
        </h1>
        <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 36 }}>
          Effective Date: June 3, 2026 · Chainmail Studio by Woven Rainbows by Erin
        </p>

        <div style={section}>
          <p style={p}>
            This Privacy Policy describes how Woven Rainbows by Erin ("we," "us," "our") collects,
            uses, and shares information when you use Chainmail Studio (the "App") via the website,
            iOS app, or Android app. By using the App, you agree to the practices described here.
          </p>
        </div>

        <div style={section}>
          <h3 style={h3}>1. Information We Collect</h3>
          <p style={p}>We collect only what is needed to provide the App.</p>
          <ul style={ul}>
            <li>
              <strong>Account information.</strong> If you create an account, we collect your email
              address and a hashed password. We do not store passwords in plain text.
            </li>
            <li>
              <strong>Designs and project data.</strong> Designs you save are stored in our database
              so you can access them from any device signed in to your account.
            </li>
            <li>
              <strong>Local preferences.</strong> Settings such as recently used tools, panel
              positions, and unsaved design state are kept on your device in local storage and are
              not transmitted to our servers unless you explicitly save a design.
            </li>
            <li>
              <strong>Reference images.</strong> Images you import via the camera or file picker are
              processed entirely on your device. They are not uploaded to our servers.
            </li>
          </ul>
        </div>

        <div style={section}>
          <h3 style={h3}>2. How We Use Information</h3>
          <ul style={ul}>
            <li>To provide and operate the App and your account.</li>
            <li>To save and load your designs across devices.</li>
            <li>To authenticate sign-in and password reset.</li>
            <li>To respond to support requests you send us.</li>
            <li>To detect and prevent abuse of the service.</li>
          </ul>
          <p style={p}>
            We do not use your information for advertising, and we do not sell your personal
            information to third parties.
          </p>
        </div>

        <div style={section}>
          <h3 style={h3}>3. Service Providers</h3>
          <p style={p}>
            We use the following service providers to operate the App. These providers process data
            on our behalf under their own privacy policies.
          </p>
          <ul style={ul}>
            <li>
              <strong>Supabase</strong> — authentication and database hosting. See{" "}
              <a
                href="https://supabase.com/privacy"
                target="_blank"
                rel="noreferrer"
                style={{ color: "#60a5fa" }}
              >
                supabase.com/privacy
              </a>
              .
            </li>
            <li>
              <strong>Netlify</strong> — web hosting and content delivery for the website. See{" "}
              <a
                href="https://www.netlify.com/privacy/"
                target="_blank"
                rel="noreferrer"
                style={{ color: "#60a5fa" }}
              >
                netlify.com/privacy
              </a>
              .
            </li>
          </ul>
          <p style={p}>
            We do not embed third-party analytics, advertising trackers, or social-media pixels in
            the App. The usage analytics described in the next section are first-party and stored in
            our own Supabase database.
          </p>
        </div>

        <div style={section}>
          <h3 style={h3}>4. Usage Analytics (First-Party)</h3>
          <p style={p}>
            To understand which features are used and where people get stuck, we record a small
            number of anonymous usage events — for example, which page or tool you open, when a
            paywall is shown, and when you sign in. These events are stored only in our own database.
          </p>
          <ul style={ul}>
            <li>We do <strong>not</strong> use Google Analytics or any third-party tracker.</li>
            <li>
              We do <strong>not</strong> record your design contents, reference images, email, name,
              or IP address as part of analytics.
            </li>
            <li>
              Each event carries only a random device id (which you can reset by clearing site
              data), your subscription tier, and — if you are signed in — your account id.
            </li>
            <li>
              We honor your browser's <em>Do Not Track</em> setting automatically, and you can opt
              out at any time below.
            </li>
          </ul>
          <AnalyticsOptOut />
        </div>

        <div style={section}>
          <h3 style={h3}>5. Mobile App Permissions</h3>
          <ul style={ul}>
            <li>
              <strong>Camera</strong> — used only when you choose to import a reference image.
              Images stay on your device.
            </li>
            <li>
              <strong>Photos / Files</strong> — used to import reference images and to save exports
              (PDFs, CSVs) to your device.
            </li>
            <li>
              <strong>Network</strong> — required for sign-in, saving designs, and downloading app
              updates.
            </li>
          </ul>
          <p style={p}>
            You can revoke any permission at any time in your device's system settings; some
            features (like reference-image import) will then be unavailable until you re-grant.
          </p>
        </div>

        <div style={section}>
          <h3 style={h3}>6. Cookies and Similar Technologies</h3>
          <p style={p}>
            The website uses only essential cookies and local storage required to keep you signed
            in and to remember your in-app preferences. We do not use cookies for advertising or
            cross-site tracking.
          </p>
        </div>

        <div style={section}>
          <h3 style={h3}>7. Children's Privacy</h3>
          <p style={p}>
            The App is not directed to children under 13, and we do not knowingly collect personal
            information from children under 13. If you believe a child has provided us with their
            information, please contact us and we will delete it.
          </p>
        </div>

        <div style={section}>
          <h3 style={h3}>8. Data Retention and Deletion</h3>
          <p style={p}>
            We retain account information and saved designs for as long as your account is active.
            If you delete your account, we will delete your account information and saved designs
            within a reasonable period, except where we are required to retain certain records for
            legal or security reasons.
          </p>
          <p style={p}>
            To request deletion, email{" "}
            <a href="mailto:micahforstein@gmail.com" style={{ color: "#60a5fa" }}>
              micahforstein@gmail.com
            </a>{" "}
            from the address associated with your account.
          </p>
        </div>

        <div style={section}>
          <h3 style={h3}>9. Security</h3>
          <p style={p}>
            Your data is encrypted in transit (HTTPS/TLS) and at rest on our service providers'
            infrastructure. While we follow industry-standard practices, no system is perfectly
            secure; please use a strong, unique password for your account.
          </p>
        </div>

        <div style={section}>
          <h3 style={h3}>10. Your Rights</h3>
          <p style={p}>
            Depending on where you live, you may have the right to access, correct, export, or
            delete the personal information we hold about you, and to object to or restrict certain
            processing. To exercise these rights, email us at the address below. Users in the EU or
            UK may also contact their local data protection authority.
          </p>
        </div>

        <div style={section}>
          <h3 style={h3}>11. International Users</h3>
          <p style={p}>
            The App is operated from the United States. If you access the App from outside the
            United States, your information will be transferred to and processed in the United
            States and other countries where our service providers operate.
          </p>
        </div>

        <div style={section}>
          <h3 style={h3}>12. Changes to This Policy</h3>
          <p style={p}>
            We may update this Privacy Policy from time to time. We will revise the Effective Date
            above and, for material changes, will provide additional notice (for example, in-app or
            by email). Continued use of the App after a change means you accept the updated policy.
          </p>
        </div>

        <div style={section}>
          <h3 style={h3}>13. Contact</h3>
          <p style={p}>
            Questions, requests, or concerns about this policy or your personal information:
          </p>
          <p style={p}>
            Woven Rainbows by Erin · Chainmail Studio
            <br />
            Email:{" "}
            <a href="mailto:micahforstein@gmail.com" style={{ color: "#60a5fa" }}>
              micahforstein@gmail.com
            </a>
          </p>
        </div>

        <div style={{ borderTop: "1px solid #1f2937", marginTop: 36, paddingTop: 20 }}>
          <Link
            to="/eula"
            style={{ color: "#6b7280", fontSize: 13, textDecoration: "none", marginRight: 16 }}
          >
            End User License Agreement →
          </Link>
          <Link
            to="/wovenrainbowsbyerin"
            style={{ color: "#6b7280", fontSize: 13, textDecoration: "none" }}
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}

// src/components/EulaDialog.tsx
import React, { useEffect, useState } from "react";

export default function EulaDialog() {
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    const hasAccepted = localStorage.getItem("eulaAccepted") === "true";
    setAccepted(hasAccepted);
  }, []);

  const handleAccept = () => {
    localStorage.setItem("eulaAccepted", "true");
    setAccepted(true);
  };

  const handleDecline = () => {
    window.location.href = "https://www.etsy.com/shop/WovenRainbowsByErin"; // 🚀 Erin's Etsy
  };

  if (accepted) {
    return null; // ✅ no reset button anymore
  }

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60"
      style={{ backdropFilter: "blur(4px)" }}
    >
      <div className="bg-white text-black rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
        {/* Scrollable content */}
        <div className="p-6 overflow-y-auto flex-1">
          <h2 className="text-xl font-bold mb-4">
            End User License Agreement (EULA)
          </h2>

          <div className="text-sm space-y-3">
            <p>
              <strong>Effective Date:</strong> [Insert Date]
            </p>
            <p>
              This End User License Agreement (“Agreement”) is a legal agreement
              between you (“User”) and <strong>Chainmail Designer</strong>
              (“Developer”).
            </p>

            <h3 className="font-semibold">1. License Grant</h3>
            <p>
              We grant you a limited, non-exclusive, non-transferable license to
              use the Application for personal or business purposes, subject to
              this Agreement.
            </p>

            <h3 className="font-semibold">2. Restrictions</h3>
            <p>
              You agree not to reverse engineer, copy, distribute, or resell the
              Application without written permission.
            </p>

            <h3 className="font-semibold">3. Payments & Access</h3>
            <p>
              Some features require payment. All sales are final. Access may be
              revoked if payment is not completed.
            </p>

            <h3 className="font-semibold">4. Disclaimer of Warranty</h3>
            <p>
              The Application is provided “AS IS” without warranties of any
              kind. We do not guarantee uninterrupted or error-free operation.
            </p>

            <h3 className="font-semibold">5. Limitation of Liability</h3>
            <p>
              To the fullest extent permitted by law, the Developer shall not be
              liable for damages resulting from the use of the Application.
            </p>

            <h3 className="font-semibold">6. Governing Law</h3>
            <p>
              This Agreement shall be governed by the laws of [Your State /
              Country].
            </p>

            <p className="italic">
              By clicking "I Accept", you acknowledge that you have read,
              understood, and agree to be bound by this Agreement.
            </p>
          </div>
        </div>

        {/* Footer buttons */}
        <div className="flex justify-end gap-2 p-4 border-t bg-gray-50">
          <button
            onClick={handleDecline}
            className="px-3 py-1 rounded bg-red-700 text-white hover:bg-red-600"
          >
            I Decline
          </button>
          <button
            onClick={handleAccept}
            className="px-3 py-1 rounded bg-green-700 text-white hover:bg-green-600"
          >
            I Accept
          </button>
        </div>
      </div>
    </div>
  );
}

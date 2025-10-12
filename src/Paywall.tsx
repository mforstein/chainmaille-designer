import React, { useState, useEffect, ReactNode } from "react";

interface PaywallProps {
  children: ReactNode; // premium content
  feature: string; // feature name (for messaging)
}

export default function Paywall({ children, feature }: PaywallProps) {
  const [unlocked, setUnlocked] = useState(false);
  const [code, setCode] = useState("");

  useEffect(() => {
    // ✅ Already unlocked?
    if (localStorage.getItem("unlocked") === "true") {
      setUnlocked(true);
      return;
    }

    // ✅ Check URL param (?unlock=ERIN50 or ?unlock=PAID)
    const params = new URLSearchParams(window.location.search);
    const unlockCode = params.get("unlock");
    if (
      unlockCode &&
      (unlockCode.toUpperCase() === "ERIN50" ||
        unlockCode.toUpperCase() === "PAID")
    ) {
      localStorage.setItem("unlocked", "true");
      setUnlocked(true);
    }
  }, []);

  function unlockWithCode() {
    if (code.trim().toUpperCase() === "ERIN50") {
      localStorage.setItem("unlocked", "true");
      setUnlocked(true);
      alert("Unlocked! Refresh will keep it enabled.");
    } else {
      alert("Invalid unlock code.");
    }
  }

  function goToCheckout() {
    // ✅ Replace with Erin’s Square Checkout link
    const squareCheckoutUrl =
      "https://square.link/u/YOUR-CHECKOUT-LINK-HERE" +
      "?redirect_to=" +
      encodeURIComponent(window.location.origin + "/?unlock=PAID");

    window.location.href = squareCheckoutUrl;
  }

  if (unlocked) {
    return <>{children}</>;
  }

  return (
    <div className="p-4 border border-slate-700 rounded bg-slate-800 text-center">
      <p className="mb-2 text-sm">
        🔒 This feature (<strong>{feature}</strong>) is premium.
      </p>

      <button
        onClick={goToCheckout}
        className="px-3 py-1 bg-green-600 hover:bg-green-500 rounded text-sm text-white mb-2"
      >
        Upgrade to Full Access
      </button>

      <div className="flex justify-center gap-2 mt-2">
        <input
          type="text"
          placeholder="Enter unlock code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="px-2 py-1 text-black rounded text-sm"
        />
        <button
          onClick={unlockWithCode}
          className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-sm text-white"
        >
          Unlock
        </button>
      </div>
    </div>
  );
}

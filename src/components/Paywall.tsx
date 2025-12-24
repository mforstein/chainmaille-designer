// src/components/Paywall.tsx
import React from "react";
import useUnlocked from "../hooks/useUnlocked";

interface PaywallProps {
  feature: string;
  children: React.ReactNode;
}

export default function Paywall({ feature, children }: PaywallProps) {
  const { unlocked, unlock } = useUnlocked();

  if (unlocked) return <>{children}</>;

  return (
    <div className="relative group">
      <div className="opacity-50 pointer-events-none">{children}</div>
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 text-white rounded-md p-3 gap-2">
        <span className="text-sm font-medium text-center">
          {feature} requires unlock.
        </span>
        <button
          onClick={unlock}
          className="px-3 py-1 bg-purple-600 hover:bg-purple-700 rounded text-xs"
        >
          Unlock Demo
        </button>
      </div>
    </div>
  );
}

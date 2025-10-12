// src/hooks/useUnlocked.ts
import { useEffect, useState } from "react";

export default function useUnlocked() {
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("unlocked") === "true") {
      setUnlocked(true);
    }
  }, []);

  function unlock() {
    localStorage.setItem("unlocked", "true");
    setUnlocked(true);
  }

  function lock() {
    localStorage.removeItem("unlocked");
    setUnlocked(false);
  }

  return { unlocked, unlock, lock };
}
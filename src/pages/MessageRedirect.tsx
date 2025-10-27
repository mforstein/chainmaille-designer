import React, { useEffect } from "react";

export default function MessageRedirect() {
  useEffect(() => {
    window.location.href = "https://www.etsy.com/conversations/new?to_user=wovenrainbowsbyerin";
  }, []);

  return (
    <div style={{ padding: 24, textAlign:"center", marginTop:40 }}>
      <p>Redirecting you to Erin’s Etsy messages page…</p>
    </div>
  );
}
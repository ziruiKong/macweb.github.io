"use client";

import { useEffect } from "react";

export default function NotFound() {
  useEffect(() => {
    const path = window.location.pathname;
    const isYarripediaPath =
      path === "/yarripedia" || path.startsWith("/yarripedia/");
    if (isYarripediaPath) {
      const suffix = path.slice("/yarripedia".length) || "/";
      window.location.replace(
        "https://yarripedia.rayk.chatgpt.site" +
          suffix +
          window.location.search +
          window.location.hash,
      );
    }
  }, []);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "2rem",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <p>页面不存在。</p>
    </main>
  );
}

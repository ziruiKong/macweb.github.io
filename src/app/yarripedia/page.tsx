"use client";

import { useEffect } from "react";

export default function YarripediaRedirect() {
  useEffect(() => {
    const target =
      "https://yarripedia.rayk.chatgpt.site/" +
      window.location.search +
      window.location.hash;
    window.location.replace(target);
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
      <p>
        正在打开{" "}
        <a href="https://yarripedia.rayk.chatgpt.site/">Yarripedia</a>…
      </p>
    </main>
  );
}

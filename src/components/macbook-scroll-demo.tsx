"use client";

import { useEffect, useState } from "react";
import { MacbookScroll } from "@/components/ui/macbook-scroll";

export default function MacbookScrollDemo() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timeout = window.setTimeout(() => setIsLoading(false), 1800);

    return () => window.clearTimeout(timeout);
  }, []);

  if (isLoading) {
    return (
      <main className="site-loader-screen" aria-label="Loading website">
        <div className="banter-loader" aria-hidden="true">
          {Array.from({ length: 9 }).map((_, index) => (
            <div className="banter-loader__box" key={index} />
          ))}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white text-stone-950">
      <MacbookScroll
        title={
          <span>
            ????????
            <br />
            ????,??????????
          </span>
        }
      />
    </main>
  );
}

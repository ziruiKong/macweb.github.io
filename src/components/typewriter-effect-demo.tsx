"use client";

import { TypewriterEffect } from "@/components/ui/typewriter-effect";

export function TypewriterEffectDemo() {
  const words = [
    { text: "Build" },
    { text: "awesome" },
    { text: "apps" },
    { text: "with" },
    { text: "Aceternity.", className: "text-blue-500" },
  ];

  return (
    <div className="flex h-[40rem] flex-col items-center justify-center">
      <p className="mb-10 text-base text-neutral-600">
        The road to freedom starts from here
      </p>
      <TypewriterEffect words={words} />
      <div className="mt-10 flex flex-col space-y-4 md:flex-row md:space-y-0 md:space-x-4">
        <button className="h-10 w-40 rounded-xl border border-transparent bg-black text-sm text-white">
          Join now
        </button>
        <button className="h-10 w-40 rounded-xl border border-black bg-white text-sm text-black">
          Signup
        </button>
      </div>
    </div>
  );
}

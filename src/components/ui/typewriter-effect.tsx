"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";

type TypewriterWord = {
  text: string;
  className?: string;
};

export function TypewriterEffect({
  words,
  className,
  cursorClassName,
}: {
  words: TypewriterWord[];
  className?: string;
  cursorClassName?: string;
}) {
  return (
    <div className={cn("flex items-center justify-center", className)}>
      <div className="inline-flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        {words.map((word, wordIndex) => (
          <span
            className={cn("inline-block whitespace-nowrap", word.className)}
            key={`${word.text}-${wordIndex}`}
          >
            {word.text.split("").map((letter, letterIndex) => (
              <motion.span
                className="inline-block"
                initial={{ opacity: 0, y: 8, filter: "blur(6px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{
                  delay: wordIndex * 0.34 + letterIndex * 0.045,
                  duration: 0.18,
                  ease: "easeOut",
                }}
                key={`${word.text}-${letter}-${letterIndex}`}
              >
                {letter}
              </motion.span>
            ))}
          </span>
        ))}
      </div>
      <motion.span
        className={cn("ml-3 inline-block h-[0.9em] w-[3px] bg-neutral-900", cursorClassName)}
        animate={{ opacity: [0, 1, 1, 0] }}
        transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

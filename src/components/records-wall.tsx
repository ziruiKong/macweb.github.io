"use client";

import { useState } from "react";
import { motion, type Variants } from "motion/react";
import { cn } from "@/lib/utils";

type RecordItem = {
  title: string;
  artist: string;
  year: string;
  mood: string;
  gradient: string;
  accent: string;
};

const RECORDS: RecordItem[] = [
  {
    title: "Midnight Data",
    artist: "Zirui Kong",
    year: "2026",
    mood: "city lights / late work",
    gradient: "linear-gradient(135deg,#0f172a 0%,#2563eb 48%,#67e8f9 100%)",
    accent: "#67e8f9",
  },
  {
    title: "Buckeye Theory",
    artist: "Columbus Session",
    year: "2024",
    mood: "campus / economics / growth",
    gradient: "linear-gradient(135deg,#111827 0%,#b91c1c 52%,#f8fafc 100%)",
    accent: "#ef4444",
  },
  {
    title: "North Star",
    artist: "Columbia Chapter",
    year: "2026",
    mood: "new city / new questions",
    gradient: "linear-gradient(135deg,#020617 0%,#0ea5e9 45%,#e0f2fe 100%)",
    accent: "#38bdf8",
  },
  {
    title: "Mandarin Flow",
    artist: "Rap Notes",
    year: "2025",
    mood: "identity / rhythm / words",
    gradient: "linear-gradient(135deg,#18181b 0%,#7c3aed 50%,#f0abfc 100%)",
    accent: "#c084fc",
  },
  {
    title: "Final Whistle",
    artist: "Football Memory",
    year: "2022",
    mood: "focus / patience / greatness",
    gradient: "linear-gradient(135deg,#111827 0%,#16a34a 48%,#fde68a 100%)",
    accent: "#facc15",
  },
  {
    title: "Handshake Club",
    artist: "North London",
    year: "1886",
    mood: "trust / unity / belief",
    gradient: "linear-gradient(135deg,#1f0303 0%,#dc2626 46%,#fef2f2 100%)",
    accent: "#f87171",
  },
  {
    title: "Soft Launch",
    artist: "Personal Archive",
    year: "Now",
    mood: "portfolio / small rituals",
    gradient: "linear-gradient(135deg,#030712 0%,#14b8a6 45%,#ccfbf1 100%)",
    accent: "#2dd4bf",
  },
];

const CARD_SPACING = 34;

const spring = {
  type: "spring" as const,
  visualDuration: 0.5,
  bounce: 0.2,
};

export function RecordsWall() {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const isActive = activeIndex !== null;

  const containerVariants: Variants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: 0.08,
        staggerDirection: -1,
      },
    },
  };

  const cardVariants: Variants = {
    hidden: (offset: number) => ({ x: offset, opacity: 0 }),
    visible: { x: 0, opacity: 1, transition: spring },
  };

  return (
    <main className="relative min-h-dvh overflow-hidden bg-[#03060d] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(34,211,238,0.22),transparent_28%),radial-gradient(circle_at_18%_72%,rgba(124,58,237,0.24),transparent_30%),linear-gradient(180deg,#02040a,#07111f_52%,#02040a)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/20" />

      <section className="relative flex min-h-dvh flex-col items-center justify-center px-5 py-16">
        <div className="mb-8 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-cyan-200/80">
            Zirui Kong
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-normal text-white md:text-7xl">
            Records Wall
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-white/58 md:text-base">
            A personal wall of albums, memories, places, and sounds.
          </p>
        </div>

        <motion.div
          className="relative h-[390px] w-[min(92vw,620px)] overflow-visible md:h-[520px]"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          onMouseLeave={() => setActiveIndex(null)}
        >
          <div className="absolute bottom-0 left-1/2 h-[300px] w-[270px] -translate-x-1/2 md:h-[430px] md:w-[360px]">
            {RECORDS.map((record, index) => {
              const current = activeIndex === index;
              const shouldShift = activeIndex !== null && index > activeIndex;
              const entranceOffset = -index * CARD_SPACING;
              const left = index * CARD_SPACING;

              return (
                <motion.article
                  key={record.title}
                  className="group absolute bottom-0 h-[300px] w-[210px] touch-manipulation outline-none md:h-[430px] md:w-[300px]"
                  style={{ left, zIndex: current ? 50 : 10 + index }}
                  variants={cardVariants}
                  custom={entranceOffset}
                  onMouseEnter={() => setActiveIndex(index)}
                  onFocus={() => setActiveIndex(index)}
                  onClick={() =>
                    setActiveIndex((value) => (value === index ? null : index))
                  }
                  tabIndex={0}
                >
                  <motion.div
                    className="relative h-full w-full"
                    animate={{
                      x: shouldShift ? 74 : current ? -16 : 0,
                      y: current ? -18 : 0,
                      rotate: current ? -2 : index * 0.65,
                    }}
                    transition={spring}
                  >
                    <motion.div
                      className="absolute top-7 left-[42%] h-[210px] w-[210px] rounded-full bg-black shadow-[0_28px_70px_rgba(0,0,0,0.45)] md:top-12 md:h-[300px] md:w-[300px]"
                      animate={{
                        x: current ? 92 : 18,
                        rotate: current ? 24 : 0,
                      }}
                      transition={spring}
                    >
                      <div className="absolute inset-3 rounded-full border border-white/8 bg-[repeating-radial-gradient(circle,rgba(255,255,255,0.12)_0_1px,transparent_1px_7px)]" />
                      <div
                        className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20 md:h-24 md:w-24"
                        style={{ background: record.accent }}
                      />
                      <div className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#03060d]" />
                    </motion.div>

                    <div
                      className="relative z-10 flex h-full w-full flex-col justify-between overflow-hidden rounded-[8px] border border-white/14 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.42)]"
                      style={{ background: record.gradient }}
                    >
                      <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.26),transparent_24%,transparent_64%,rgba(255,255,255,0.16))]" />
                      <div className="absolute inset-x-5 top-20 h-px bg-white/30" />
                      <div className="relative">
                        <p className="text-[10px] font-bold uppercase tracking-[0.26em] text-white/65">
                          {record.year}
                        </p>
                        <h2 className="mt-3 text-2xl font-black leading-none md:text-4xl">
                          {record.title}
                        </h2>
                      </div>
                      <div className="relative">
                        <p className="text-xs font-semibold text-white/88 md:text-sm">
                          {record.artist}
                        </p>
                        <p className="mt-1 text-[11px] leading-4 text-white/62 md:text-xs">
                          {record.mood}
                        </p>
                      </div>
                    </div>

                    <div
                      className={cn(
                        "pointer-events-none absolute -bottom-10 left-4 right-4 h-12 rounded-full bg-black/40 blur-xl transition-opacity duration-300",
                        current ? "opacity-70" : "opacity-30",
                      )}
                    />
                  </motion.div>
                </motion.article>
              );
            })}
          </div>
        </motion.div>
      </section>
    </main>
  );
}

export default RecordsWall;

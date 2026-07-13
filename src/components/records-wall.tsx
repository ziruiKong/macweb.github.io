"use client";

import { useState } from "react";
import { motion, type Variants } from "motion/react";

type RecordItem = {
  id: string;
  coverSrc?: string;
  gradient: string;
};

const RECORDS: RecordItem[] = [
  {
    id: "cover-1",
    coverSrc: "/record-cover-1.webp",
    gradient: "linear-gradient(135deg,#050505,#111827)",
  },
  {
    id: "cover-2",
    gradient: "linear-gradient(135deg,#050505 0%,#101820 54%,#0f172a 100%)",
  },
  {
    id: "cover-3",
    gradient: "linear-gradient(135deg,#060606 0%,#121212 50%,#1f2937 100%)",
  },
  {
    id: "cover-4",
    gradient: "linear-gradient(135deg,#050505 0%,#111111 45%,#172554 100%)",
  },
  {
    id: "cover-5",
    gradient: "linear-gradient(135deg,#080808 0%,#1a1111 48%,#3f1212 100%)",
  },
  {
    id: "cover-6",
    gradient: "linear-gradient(135deg,#040404 0%,#111827 45%,#312e81 100%)",
  },
  {
    id: "cover-7",
    gradient: "linear-gradient(135deg,#030303 0%,#101010 44%,#134e4a 100%)",
  },
];

const CARD_SPACING = 40;

const spring = {
  type: "spring" as const,
  visualDuration: 0.55,
  bounce: 0.18,
};

export function RecordsWall() {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

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
    <main className="relative min-h-dvh overflow-hidden bg-black text-white">
      <section className="relative flex min-h-dvh items-center justify-center px-4">
        <motion.div
          className="relative h-[420px] w-[min(92vw,760px)] overflow-visible md:h-[560px]"
          style={{ perspective: "1400px" }}
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          onMouseLeave={() => setActiveIndex(null)}
        >
          <div className="absolute left-1/2 top-1/2 h-[280px] w-[300px] -translate-x-1/2 -translate-y-1/2 md:h-[390px] md:w-[430px]">
            {RECORDS.map((record, index) => {
              const current = activeIndex === index;
              const shouldShift = activeIndex !== null && index > activeIndex;
              const entranceOffset = -index * CARD_SPACING;
              const left = index * CARD_SPACING;

              return (
                <motion.article
                  key={record.id}
                  className="absolute bottom-0 h-[280px] w-[280px] touch-manipulation outline-none md:h-[390px] md:w-[390px]"
                  style={{
                    left,
                    zIndex: current ? 50 : 10 + index,
                    transformStyle: "preserve-3d",
                  }}
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
                      x: shouldShift ? 84 : current ? 28 : 0,
                      y: current ? -12 : 0,
                      rotateY: current ? -18 : -36,
                      rotateZ: current ? 0 : index * 0.18,
                    }}
                    transition={spring}
                    style={{
                      transformStyle: "preserve-3d",
                      transformOrigin: "left center",
                    }}
                  >
                    <div
                      className="relative h-full w-full overflow-hidden rounded-[7px] border border-white/12 bg-black shadow-[0_34px_90px_rgba(0,0,0,0.62)]"
                      style={{ background: record.gradient }}
                    >
                      {record.coverSrc ? (
                        <img
                          src={record.coverSrc}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <>
                          <div className="absolute inset-0 bg-[radial-gradient(circle_at_35%_22%,rgba(255,255,255,0.16),transparent_24%),linear-gradient(120deg,rgba(255,255,255,0.06),transparent_28%,transparent_68%,rgba(255,255,255,0.04))]" />
                          <div className="absolute inset-y-0 left-0 w-px bg-white/24" />
                        </>
                      )}
                      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(105deg,rgba(255,255,255,0.16),transparent_24%,transparent_66%,rgba(255,255,255,0.05))]" />
                    </div>

                    <div className="pointer-events-none absolute -left-[5px] top-[4px] h-[calc(100%-8px)] w-[8px] rounded-l-[4px] bg-[linear-gradient(180deg,rgba(255,255,255,0.16),rgba(0,0,0,0.7))]" />
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

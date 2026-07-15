"use client";

import { ChapterScrubber, type Chapter } from "@/components/ui/chapter-scrubber";

const SITE_CHAPTERS: Chapter[] = [
  {
    id: "home",
    meta: "01",
    title: "Mac Entrance",
    description: "The simulated macOS launch screen and personal site gateway.",
  },
  {
    id: "lock",
    meta: "02",
    title: "Lock Screen",
    description: "A desktop-like lock screen with time, profile, and responsive wallpaper.",
  },
  {
    id: "stickers",
    meta: "03",
    title: "Sticker Story",
    description: "Clubs, music, football, and schools collected on the keyboard deck.",
  },
  {
    id: "records",
    meta: "04",
    title: "Records Wall",
    description: "A separate album wall for sounds, covers, and personal memory.",
  },
  {
    id: "enter",
    meta: "05",
    title: "Enter Site",
    description: "Scroll until the screen fills the page, then click to open the homepage.",
  },
];

export const LeftSiteRail = ({
  hidden,
  nightMode,
}: {
  hidden: boolean;
  nightMode: boolean;
}) => {
  const handleSelect = (chapter: Chapter) => {
    if (chapter.id === "records") {
      window.location.href = "/records";
    }
  };

  return (
    <div
      className={[
        "fixed left-6 top-1/2 z-30 hidden -translate-y-1/2 transition duration-300 md:block",
        hidden ? "pointer-events-none opacity-0" : "opacity-100",
      ].join(" ")}
    >
      <ChapterScrubber
        chapters={SITE_CHAPTERS}
        currentIndex={0}
        side="right"
        peakLength={62}
        restLength={13}
        rowHeight={13}
        radius={3.8}
        onSelect={handleSelect}
        className={[
          "liquid-glass-rail",
          nightMode ? "liquid-glass-rail--dark" : "liquid-glass-rail--light",
        ].join(" ")}
      />
    </div>
  );
};

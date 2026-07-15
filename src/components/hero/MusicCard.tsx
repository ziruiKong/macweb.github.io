"use client";

import { useState } from "react";
import { FloatingCard } from "@/components/hero/FloatingCard";
import { PauseIcon, PlayIcon, SkipBackIcon, SkipForwardIcon } from "@/components/hero/icons";

export const MusicCard = () => {
  const [isPlaying, setIsPlaying] = useState(false);

  return (
    <FloatingCard className="hero-card hero-card--music" contentClassName="p-5">
      <div className="flex items-center gap-4">
        <div className="hero-album-cover" aria-hidden="true" />
        <div className="min-w-0">
          <div className="truncate text-[17px] font-semibold text-white">IGNITE</div>
          <div className="mt-1 truncate text-[12px] text-slate-300/70">
            K-391, Alan Walker
          </div>
        </div>
      </div>
      <div className="mt-5">
        <div className="h-[3px] rounded-full bg-white/14">
          <div className="relative h-full w-[46%] rounded-full bg-cyan-300/80">
            <span className="absolute right-0 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-cyan-100 shadow-[0_0_12px_rgba(103,232,249,0.9)]" />
          </div>
        </div>
        <div className="mt-2 flex justify-between text-[12px] text-slate-300/72">
          <span>1:42</span>
          <span>3:31</span>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-center gap-8 text-white">
        <button className="hero-icon-button" type="button" aria-label="Previous track" data-cursor-target>
          <SkipBackIcon className="h-5 w-5" />
        </button>
        <button
          className="hero-play-button"
          type="button"
          aria-label={isPlaying ? "Pause preview" : "Play preview"}
          aria-pressed={isPlaying}
          onClick={() => setIsPlaying((current) => !current)}
          data-cursor-target
        >
          {isPlaying ? <PauseIcon className="h-5 w-5" /> : <PlayIcon className="h-5 w-5 translate-x-px" />}
        </button>
        <button className="hero-icon-button" type="button" aria-label="Next track" data-cursor-target>
          <SkipForwardIcon className="h-5 w-5" />
        </button>
      </div>
    </FloatingCard>
  );
};


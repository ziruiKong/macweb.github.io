import { FloatingCard } from "@/components/hero/FloatingCard";
import { ArrowUpRightIcon } from "@/components/hero/icons";

export const FocusCard = () => (
  <FloatingCard className="hero-card hero-card--focus" contentClassName="p-5">
    <div className="flex items-start justify-between">
      <div>
        <div className="text-[12px] text-slate-300/48">Focus Time</div>
        <div className="mt-2 text-[28px] font-semibold tracking-[-0.035em] text-white">
          4h 32m
        </div>
      </div>
      <div className="mt-6 flex items-center gap-1 text-[12px] font-medium text-cyan-300">
        +12%
        <ArrowUpRightIcon className="h-3.5 w-3.5" />
      </div>
    </div>
    <svg className="mt-4 h-11 w-full text-sky-400/78" viewBox="0 0 240 48" aria-hidden="true">
      <path
        d="M2 34 C16 26 24 28 34 36 S55 41 66 25 88 18 98 34 119 42 132 23 151 15 161 29 178 39 190 24 204 14 214 25 226 33 238 22"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
      <path
        d="M2 34 C16 26 24 28 34 36 S55 41 66 25 88 18 98 34 119 42 132 23 151 15 161 29 178 39 190 24 204 14 214 25 226 33 238 22"
        fill="none"
        stroke="rgba(125, 211, 252, 0.18)"
        strokeLinecap="round"
        strokeWidth="7"
      />
    </svg>
  </FloatingCard>
);


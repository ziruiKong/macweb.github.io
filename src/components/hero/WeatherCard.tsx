import { FloatingCard } from "@/components/hero/FloatingCard";
import { LocationIcon } from "@/components/hero/icons";

export const WeatherCard = () => (
  <FloatingCard className="hero-card hero-card--weather" contentClassName="p-6">
    <div className="flex h-full items-center justify-between gap-6">
      <div>
        <div className="flex items-center gap-1.5 text-[13px] text-slate-200/80">
          <span>New York</span>
          <LocationIcon className="h-3.5 w-3.5 text-sky-300/80" />
        </div>
        <div className="mt-3 text-[48px] font-light leading-none tracking-[-0.04em] text-white">
          18°
        </div>
        <div className="mt-4 text-[15px] text-slate-100/88">Clear Sky</div>
        <div className="mt-1 text-[13px] text-slate-300/62">H: 24° L: 12°</div>
      </div>
      <div className="hero-weather-orb" aria-hidden="true" />
    </div>
  </FloatingCard>
);


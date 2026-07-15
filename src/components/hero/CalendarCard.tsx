import { FloatingCard } from "@/components/hero/FloatingCard";

const weekDays = ["S", "M", "T", "W", "T", "F", "S"];
const dates = ["12", "13", "14", "15", "16", "17", "18"];

export const CalendarCard = () => (
  <FloatingCard className="hero-card hero-card--calendar" contentClassName="p-6">
    <div className="flex gap-8">
      <div>
        <div className="text-[15px] font-medium text-white">Thursday</div>
        <div className="mt-2 text-[54px] font-light leading-none tracking-[-0.04em] text-white">
          16
        </div>
      </div>
      <div className="mt-7 grid grid-cols-7 gap-x-2 gap-y-2 text-center text-[11px]">
        {weekDays.map((day, index) => (
          <div key={`${day}-${index}`} className="text-slate-300/54">
            {day}
          </div>
        ))}
        {dates.map((date) => (
          <div
            key={date}
            className={
              date === "16"
                ? "rounded-md bg-sky-400 px-1.5 py-0.5 font-medium text-white shadow-[0_0_14px_rgba(56,189,248,0.45)]"
                : "px-1.5 py-0.5 text-slate-300/62"
            }
          >
            {date}
          </div>
        ))}
      </div>
    </div>
    <div className="mt-6 space-y-3">
      <CalendarEvent
        time="10:00 AM"
        title="Design Review"
        place="Conference Room"
        dotClassName="bg-sky-400"
      />
      <CalendarEvent
        time="02:00 PM"
        title="Client Call"
        place="Zoom"
        dotClassName="bg-emerald-400"
      />
    </div>
  </FloatingCard>
);

const CalendarEvent = ({
  time,
  title,
  place,
  dotClassName,
}: {
  time: string;
  title: string;
  place: string;
  dotClassName: string;
}) => (
  <div className="rounded-2xl bg-white/[0.055] px-4 py-3">
    <div className="text-[12px] text-slate-300/45">{time}</div>
    <div className="mt-1 text-[15px] font-semibold text-white">{title}</div>
    <div className="mt-1 flex items-center gap-2 text-[12px] text-slate-300/56">
      <span className={`h-1.5 w-1.5 rounded-full ${dotClassName}`} />
      <span>{place}</span>
    </div>
  </div>
);


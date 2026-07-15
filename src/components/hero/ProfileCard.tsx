import Image from "next/image";
import { FloatingCard } from "@/components/hero/FloatingCard";
import { VerifiedIcon } from "@/components/hero/icons";

const stats = [
  ["128", "Projects"],
  ["2.4K", "Followers"],
  ["89", "Following"],
];

export const ProfileCard = () => (
  <FloatingCard className="hero-card hero-card--profile" contentClassName="p-6">
    <div className="flex items-center gap-5">
      <div className="relative h-[72px] w-[72px] overflow-hidden rounded-full bg-cyan-200/15">
        <Image
          src="/profile-avatar-small.jpg"
          alt="Zirui Kong avatar"
          fill
          sizes="72px"
          className="object-cover"
        />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-[18px] font-semibold text-white">
          <span className="truncate">Zirui Kong</span>
          <VerifiedIcon className="h-4 w-4 shrink-0 text-[#4aa8ff]" />
        </div>
        <div className="mt-1 text-[13px] text-slate-300/66">Focus. Build. Elevate.</div>
      </div>
    </div>
    <div className="mt-5 grid grid-cols-3 gap-3 text-center">
      {stats.map(([value, label]) => (
        <div key={label}>
          <div className="text-[15px] font-semibold tracking-[-0.02em] text-white">{value}</div>
          <div className="mt-1 text-[12px] text-slate-300/52">{label}</div>
        </div>
      ))}
    </div>
  </FloatingCard>
);


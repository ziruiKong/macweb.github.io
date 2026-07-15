import { FloatingCard } from "@/components/hero/FloatingCard";

export const FolderCard = () => (
  <FloatingCard
    className="hero-card hero-card--folder"
    contentClassName="p-6"
    ariaHidden
  >
    <div className="space-y-4 opacity-70 blur-[0.3px]">
      <div className="hero-folder-icon translate-x-2" />
      <div className="hero-folder-icon translate-x-8 opacity-75" />
      <div className="hero-folder-icon translate-x-1 opacity-55" />
      <div className="pt-2">
        <div className="text-[15px] font-medium text-white/60">Work</div>
        <div className="mt-1 text-[12px] text-slate-300/34">12 Items</div>
      </div>
    </div>
  </FloatingCard>
);


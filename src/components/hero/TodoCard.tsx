"use client";

import { useState } from "react";
import { FloatingCard } from "@/components/hero/FloatingCard";
import { CheckIcon, PlusIcon } from "@/components/hero/icons";

const initialItems = [
  { label: "Design System", completed: true },
  { label: "Workout", completed: true },
  { label: "Read", completed: false },
];

export const TodoCard = () => {
  const [items, setItems] = useState(initialItems);

  return (
    <FloatingCard className="hero-card hero-card--todo" contentClassName="p-6">
      <div className="flex items-center justify-between">
        <div className="text-[17px] font-medium text-white">Today</div>
        <div className="grid h-6 w-6 place-items-center rounded-full bg-white/10 text-[12px] text-slate-200">
          3
        </div>
      </div>
      <div className="mt-5 divide-y divide-white/8">
        {items.map((item, index) => (
          <button
            key={item.label}
            className="flex w-full items-center gap-3 py-3 text-left text-[14px] text-slate-100 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200/70"
            type="button"
            aria-pressed={item.completed}
            aria-label={`${item.label} ${item.completed ? "completed" : "not completed"}`}
            onClick={() =>
              setItems((current) =>
                current.map((entry, itemIndex) =>
                  itemIndex === index ? { ...entry, completed: !entry.completed } : entry,
                ),
              )
            }
            data-cursor-target
          >
            <span
              className={
                item.completed
                  ? "grid h-5 w-5 shrink-0 place-items-center rounded-full bg-sky-400 text-white shadow-[0_0_14px_rgba(56,189,248,0.38)]"
                  : "h-5 w-5 shrink-0 rounded-full border border-slate-100/82"
              }
              aria-hidden="true"
            >
              {item.completed && <CheckIcon className="h-3.5 w-3.5" />}
            </span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>
      <div className="mt-4 flex justify-center text-slate-300/70">
        <PlusIcon className="h-5 w-5" />
      </div>
    </FloatingCard>
  );
};


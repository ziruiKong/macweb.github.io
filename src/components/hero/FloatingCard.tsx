"use client";

import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

type FloatingCardProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  style?: CSSProperties;
  ariaHidden?: boolean;
};

export const FloatingCard = ({
  children,
  className,
  contentClassName,
  style,
  ariaHidden,
}: FloatingCardProps) => (
  <div
    className={cn("hero-floating-card", className)}
    style={style}
    aria-hidden={ariaHidden}
    data-cursor-target
  >
    <div className={cn("hero-floating-card__content", contentClassName)}>
      {children}
    </div>
  </div>
);

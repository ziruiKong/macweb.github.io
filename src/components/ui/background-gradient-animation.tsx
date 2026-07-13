"use client";

import { cn } from "@/lib/utils";
import React, { useRef } from "react";

export const BackgroundGradientAnimation = ({
  gradientBackgroundStart = "rgb(255, 255, 255)",
  gradientBackgroundEnd = "rgb(239, 231, 255)",
  firstColor = "168, 133, 244",
  secondColor = "221, 74, 255",
  thirdColor = "100, 220, 255",
  fourthColor = "140, 100, 255",
  fifthColor = "255, 255, 255",
  pointerColor = "140, 100, 255",
  size = "80%",
  blendingValue = "hard-light",
  children,
  className,
  interactive = true,
  containerClassName,
}: {
  gradientBackgroundStart?: string;
  gradientBackgroundEnd?: string;
  firstColor?: string;
  secondColor?: string;
  thirdColor?: string;
  fourthColor?: string;
  fifthColor?: string;
  pointerColor?: string;
  size?: string;
  blendingValue?: string;
  children?: React.ReactNode;
  className?: string;
  interactive?: boolean;
  containerClassName?: string;
}) => {
  const interactiveRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!interactiveRef.current || !rootRef.current) return;

    const rect = rootRef.current.getBoundingClientRect();
    interactiveRef.current.style.transform = `translate(${Math.round(
      event.clientX - rect.left,
    )}px, ${Math.round(event.clientY - rect.top)}px)`;
  };

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative h-full w-full overflow-hidden bg-[linear-gradient(40deg,var(--gradient-background-start),var(--gradient-background-end))]",
        containerClassName,
      )}
      onMouseMove={handleMouseMove}
      style={
        {
          "--gradient-background-start": gradientBackgroundStart,
          "--gradient-background-end": gradientBackgroundEnd,
          "--first-color": firstColor,
          "--second-color": secondColor,
          "--third-color": thirdColor,
          "--fourth-color": fourthColor,
          "--fifth-color": fifthColor,
          "--pointer-color": pointerColor,
          "--size": size,
          "--blending-value": blendingValue,
        } as React.CSSProperties
      }
    >
      <svg className="hidden">
        <defs>
          <filter id="blurMe">
            <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -8"
              result="goo"
            />
            <feBlend in="SourceGraphic" in2="goo" />
          </filter>
        </defs>
      </svg>

      <div className={cn("relative z-10", className)}>{children}</div>
      <div
        className="gradients-container absolute inset-0 h-full w-full blur-lg [filter:url(#blurMe)_blur(40px)]"
      >
        <div className="absolute top-[calc(50%-var(--size)/2)] left-[calc(50%-var(--size)/2)] h-[var(--size)] w-[var(--size)] animate-first rounded-full bg-[radial-gradient(circle_at_center,rgba(var(--first-color),0.9)_0,rgba(var(--first-color),0)_54%)] opacity-100 [mix-blend-mode:var(--blending-value)] [transform-origin:center_center]" />
        <div className="absolute top-[calc(50%-var(--size)/2)] left-[calc(50%-var(--size)/2)] h-[var(--size)] w-[var(--size)] animate-second rounded-full bg-[radial-gradient(circle_at_center,rgba(var(--second-color),0.74)_0,rgba(var(--second-color),0)_54%)] opacity-100 [mix-blend-mode:var(--blending-value)] [transform-origin:calc(50%-400px)]" />
        <div className="absolute top-[calc(50%-var(--size)/2)] left-[calc(50%-var(--size)/2)] h-[var(--size)] w-[var(--size)] animate-third rounded-full bg-[radial-gradient(circle_at_center,rgba(var(--third-color),0.72)_0,rgba(var(--third-color),0)_54%)] opacity-100 [mix-blend-mode:var(--blending-value)] [transform-origin:calc(50%+400px)]" />
        <div className="absolute top-[calc(50%-var(--size)/2)] left-[calc(50%-var(--size)/2)] h-[var(--size)] w-[var(--size)] animate-fourth rounded-full bg-[radial-gradient(circle_at_center,rgba(var(--fourth-color),0.68)_0,rgba(var(--fourth-color),0)_54%)] opacity-90 [mix-blend-mode:var(--blending-value)] [transform-origin:calc(50%-200px)]" />
        <div className="absolute top-[calc(50%-var(--size)/2)] left-[calc(50%-var(--size)/2)] h-[var(--size)] w-[var(--size)] animate-fifth rounded-full bg-[radial-gradient(circle_at_center,rgba(var(--fifth-color),0.78)_0,rgba(var(--fifth-color),0)_54%)] opacity-100 [mix-blend-mode:var(--blending-value)] [transform-origin:calc(50%-800px)_calc(50%+800px)]" />

        {interactive && (
          <div
            ref={interactiveRef}
            className="absolute -top-1/2 -left-1/2 h-full w-full bg-[radial-gradient(circle_at_center,rgba(var(--pointer-color),0.45)_0,rgba(var(--pointer-color),0)_50%)] opacity-70 [mix-blend-mode:var(--blending-value)]"
          />
        )}
      </div>
    </div>
  );
};

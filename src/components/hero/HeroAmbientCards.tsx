"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef } from "react";
import { CalendarCard } from "@/components/hero/CalendarCard";
import { FocusCard } from "@/components/hero/FocusCard";
import { FolderCard } from "@/components/hero/FolderCard";
import { MusicCard } from "@/components/hero/MusicCard";
import { ProfileCard } from "@/components/hero/ProfileCard";
import { TodoCard } from "@/components/hero/TodoCard";
import { WeatherCard } from "@/components/hero/WeatherCard";
import type { FloatingCardConfig, FloatingCardName } from "@/components/hero/types";

const FLOAT_CONFIG: Record<FloatingCardName, FloatingCardConfig> = {
  music: {
    className: "hero-ambient-item--music",
    floatClassName: "hero-float-slow",
    parallaxX: -10,
    parallaxY: -5,
    parallaxRotate: -0.9,
  },
  profile: {
    className: "hero-ambient-item--profile",
    floatClassName: "hero-float-medium",
    parallaxX: -7,
    parallaxY: 4,
    parallaxRotate: 0.55,
  },
  todo: {
    className: "hero-ambient-item--todo",
    floatClassName: "hero-float-long",
    parallaxX: -12,
    parallaxY: 6,
    parallaxRotate: -1,
  },
  calendar: {
    className: "hero-ambient-item--calendar",
    floatClassName: "hero-float-medium hero-float-delay-1",
    parallaxX: 9,
    parallaxY: -6,
    parallaxRotate: 1.1,
  },
  weather: {
    className: "hero-ambient-item--weather",
    floatClassName: "hero-float-slow hero-float-delay-2",
    parallaxX: 7,
    parallaxY: 5,
    parallaxRotate: 0.65,
  },
  focus: {
    className: "hero-ambient-item--focus",
    floatClassName: "hero-float-long hero-float-delay-3",
    parallaxX: 11,
    parallaxY: 7,
    parallaxRotate: 1,
  },
  folder: {
    className: "hero-ambient-item--folder",
    floatClassName: "hero-float-slow hero-float-delay-2",
    parallaxX: 4,
    parallaxY: -3,
    parallaxRotate: 0.35,
  },
};

const CARDS: Array<{ name: FloatingCardName; component: ReactNode }> = [
  { name: "folder", component: <FolderCard /> },
  { name: "music", component: <MusicCard /> },
  { name: "profile", component: <ProfileCard /> },
  { name: "todo", component: <TodoCard /> },
  { name: "calendar", component: <CalendarCard /> },
  { name: "weather", component: <WeatherCard /> },
  { name: "focus", component: <FocusCard /> },
];

export const HeroAmbientCards = ({ opacity }: { opacity: number }) => {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const pointerRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer || !window.matchMedia("(pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const render = () => {
      frameRef.current = null;
      const { x, y } = pointerRef.current;
      layer.style.setProperty("--hero-parallax-x", x.toFixed(4));
      layer.style.setProperty("--hero-parallax-y", y.toFixed(4));
    };

    const schedule = () => {
      if (frameRef.current !== null) return;
      frameRef.current = window.requestAnimationFrame(render);
    };

    const handlePointerMove = (event: PointerEvent) => {
      pointerRef.current = {
        x: (event.clientX / window.innerWidth - 0.5) * 2,
        y: (event.clientY / window.innerHeight - 0.5) * 2,
      };
      schedule();
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });

    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
      window.removeEventListener("pointermove", handlePointerMove);
    };
  }, []);

  return (
    <div
      ref={layerRef}
      className="hero-ambient-layer"
      style={{ opacity, "--hero-parallax-x": 0, "--hero-parallax-y": 0 } as CSSProperties}
      aria-hidden={opacity < 0.05}
    >
      <div className="hero-scene-glow" aria-hidden="true" />
      <div className="hero-scene-noise" aria-hidden="true" />
      {CARDS.map(({ name, component }, index) => {
        const config = FLOAT_CONFIG[name];
        return (
          <div
            key={name}
            className={`hero-ambient-item ${config.className}`}
            style={
              {
                "--hero-enter-delay": `${180 + index * 80}ms`,
                "--hero-card-px": config.parallaxX,
                "--hero-card-py": config.parallaxY,
                "--hero-card-pr": config.parallaxRotate,
              } as CSSProperties
            }
          >
            <div className={`hero-ambient-float ${config.floatClassName}`}>
              {component}
            </div>
          </div>
        );
      })}
    </div>
  );
};

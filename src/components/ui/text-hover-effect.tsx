"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { motion } from "motion/react";

export const TextHoverEffect = ({
  text,
  duration,
}: {
  text: string;
  duration?: number;
  automatic?: boolean;
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const gradientId = useId();
  const maskId = useId();
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const [hovered, setHovered] = useState(false);
  const [maskPosition, setMaskPosition] = useState({ cx: "50%", cy: "50%" });

  useEffect(() => {
    if (svgRef.current) {
      const svgRect = svgRef.current.getBoundingClientRect();
      const cxPercentage = ((cursor.x - svgRect.left) / svgRect.width) * 100;
      const cyPercentage = ((cursor.y - svgRect.top) / svgRect.height) * 100;
      setMaskPosition({
        cx: `${cxPercentage}%`,
        cy: `${cyPercentage}%`,
      });
    }
  }, [cursor]);

  return (
    <svg
      ref={svgRef}
      width="100%"
      height="100%"
      viewBox="0 0 900 100"
      xmlns="http://www.w3.org/2000/svg"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseMove={(event) => setCursor({ x: event.clientX, y: event.clientY })}
      className="select-none"
    >
      <defs>
        <motion.linearGradient
          id={gradientId}
          gradientUnits="userSpaceOnUse"
          x1="-220"
          y1="0"
          x2="1120"
          y2="100"
          animate={{
            x1: ["-220", "80", "-220"],
            x2: ["1120", "1420", "1120"],
          }}
          transition={{
            duration: 5.5,
            ease: "easeInOut",
            repeat: Infinity,
          }}
        >
          <stop offset="0%" stopColor="#f59e0b" />
          <stop offset="18%" stopColor="#fb7185" />
          <stop offset="36%" stopColor="#a855f7" />
          <stop offset="54%" stopColor="#38bdf8" />
          <stop offset="72%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#f97316" />
        </motion.linearGradient>

        <motion.radialGradient
          id={maskId}
          gradientUnits="userSpaceOnUse"
          r={hovered ? "28%" : "38%"}
          initial={{ cx: "50%", cy: "50%" }}
          animate={hovered ? maskPosition : { cx: "50%", cy: "50%" }}
          transition={{ duration: duration ?? 0, ease: "easeOut" }}
        >
          <stop offset="0%" stopColor="white" />
          <stop offset="100%" stopColor="black" />
        </motion.radialGradient>
        <mask id={`${maskId}-mask`}>
          <rect x="0" y="0" width="100%" height="100%" fill={`url(#${maskId})`} />
        </mask>
      </defs>
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="middle"
        strokeWidth="0.75"
        className="fill-transparent stroke-neutral-200 font-[helvetica] text-7xl font-black"
        style={{ opacity: hovered ? 0.9 : 0.55 }}
      >
        {text}
      </text>
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="middle"
        stroke={`url(#${gradientId})`}
        strokeWidth="1.15"
        className="fill-transparent font-[helvetica] text-7xl font-black opacity-25 blur-[1.4px]"
        style={{ opacity: hovered ? 0.28 : 0 }}
      >
        {text}
      </text>
      <motion.text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="middle"
        strokeWidth="0.55"
        className="fill-transparent stroke-neutral-500 font-[helvetica] text-7xl font-black"
        initial={{ strokeDashoffset: 1000, strokeDasharray: 1000 }}
        animate={{
          strokeDashoffset: 0,
          strokeDasharray: 1000,
        }}
        transition={{
          duration: 4,
          ease: "easeInOut",
        }}
      >
        {text}
      </motion.text>
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="middle"
        stroke={`url(#${gradientId})`}
        strokeWidth="0.9"
        mask={`url(#${maskId}-mask)`}
        className="fill-transparent font-[helvetica] text-7xl font-black"
        style={{ opacity: hovered ? 1 : 0 }}
      >
        {text}
      </text>
    </svg>
  );
};

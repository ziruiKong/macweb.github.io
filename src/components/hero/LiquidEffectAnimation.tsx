"use client";

import { useEffect, useRef } from "react";

type LiquidBackgroundApp = {
  dispose?: () => void;
};

declare global {
  interface Window {
    __ziruiLiquidApp?: LiquidBackgroundApp;
  }
}

const LIQUID_CANVAS_ID = "zirui-liquid-canvas";
const LIQUID_SCRIPT_ID = "zirui-liquid-background-script";

export const LiquidEffectAnimation = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    window.__ziruiLiquidApp?.dispose?.();
    window.__ziruiLiquidApp = undefined;

    const existingScript = document.getElementById(LIQUID_SCRIPT_ID);
    existingScript?.remove();

    const script = document.createElement("script");
    script.id = LIQUID_SCRIPT_ID;
    script.type = "module";
    script.textContent = `
      import LiquidBackground from 'https://cdn.jsdelivr.net/npm/threejs-components@0.0.22/build/backgrounds/liquid1.min.js';

      const canvas = document.getElementById('${LIQUID_CANVAS_ID}');
      if (canvas) {
        const app = LiquidBackground(canvas);
        app.loadImage('https://hebbkx1anhila5yf.public.blob.vercel-storage.com/enhanced_8bfe61b0-d431-433a-8acb-49d508bf88b4-image-vWzKFKS7vQy7s8wfQYzEpaoiYaVMkr.png');
        app.liquidPlane.material.metalness = 0.75;
        app.liquidPlane.material.roughness = 0.25;
        app.liquidPlane.uniforms.displacementScale.value = 5;
        app.setRain(false);
        window.__ziruiLiquidApp = app;
      }
    `;
    document.body.appendChild(script);

    return () => {
      window.__ziruiLiquidApp?.dispose?.();
      window.__ziruiLiquidApp = undefined;
      document.getElementById(LIQUID_SCRIPT_ID)?.remove();
    };
  }, []);

  return (
    <div className="hero-liquid-effect" aria-hidden="true">
      <canvas ref={canvasRef} id={LIQUID_CANVAS_ID} className="hero-liquid-canvas" />
    </div>
  );
};


"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

export default function Macbook3DPage() {
  const mountRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    const canvas = canvasRef.current;
    if (!mount || !canvas) return;
    const stage = mount;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x061323, 12, 24);

    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    camera.position.set(5.8, 3.35, 6.2);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 0.72, -0.22);
    controls.minDistance = 5.2;
    controls.maxDistance = 11;
    controls.maxPolarAngle = Math.PI * 0.64;
    controls.minPolarAngle = Math.PI * 0.22;

    const root = new THREE.Group();
    root.rotation.y = -0.22;
    root.rotation.x = -0.03;
    scene.add(root);

    const metal = new THREE.MeshPhysicalMaterial({
      color: 0xd8dee4,
      roughness: 0.34,
      metalness: 0.82,
      clearcoat: 0.35,
      clearcoatRoughness: 0.45,
    });
    const bevelMetal = new THREE.MeshPhysicalMaterial({
      color: 0xf2f5f7,
      roughness: 0.28,
      metalness: 0.72,
      clearcoat: 0.3,
    });
    const black = new THREE.MeshStandardMaterial({
      color: 0x050609,
      roughness: 0.42,
      metalness: 0.2,
    });
    const darkKey = new THREE.MeshStandardMaterial({
      color: 0x020306,
      roughness: 0.5,
      metalness: 0.1,
    });
    const keyLabel = new THREE.MeshBasicMaterial({ color: 0xf5f7ff });
    const screenGlow = new THREE.MeshBasicMaterial({
      color: 0x4fc8ff,
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    function roundedBox(
      width: number,
      height: number,
      depth: number,
      radius: number,
      smoothness: number,
      material: THREE.Material,
    ) {
      const mesh = new THREE.Mesh(
        new RoundedBoxGeometry(width, height, depth, smoothness, radius),
        material,
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    }

    function panel(
      width: number,
      height: number,
      depth: number,
      material: THREE.Material,
    ) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        material,
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    }

    const base = roundedBox(6.2, 0.24, 4.0, 0.18, 10, metal);
    base.position.y = 0.12;
    root.add(base);

    const frontLip = roundedBox(1.1, 0.035, 0.08, 0.04, 6, black);
    frontLip.position.set(0, 0.255, 1.96);
    root.add(frontLip);

    const topPlate = roundedBox(5.86, 0.035, 3.56, 0.13, 8, bevelMetal);
    topPlate.position.y = 0.265;
    root.add(topPlate);

    const trackpad = roundedBox(
      2.3,
      0.018,
      0.9,
      0.08,
      8,
      new THREE.MeshPhysicalMaterial({
        color: 0xe8ecef,
        roughness: 0.22,
        metalness: 0.45,
        clearcoat: 0.55,
      }),
    );
    trackpad.position.set(0, 0.296, 1.08);
    root.add(trackpad);

    const keyboard = new THREE.Group();
    keyboard.position.set(0, 0.32, -0.56);
    root.add(keyboard);

    const rowSpecs = [
      {
        z: -0.82,
        widths: [
          0.38, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42,
          0.42, 0.42, 0.42, 0.44,
        ],
      },
      {
        z: -0.42,
        widths: [
          0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42,
          0.42, 0.42, 0.42, 0.66,
        ],
      },
      {
        z: -0.02,
        widths: [
          0.62, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42,
          0.42, 0.42, 0.62,
        ],
      },
      {
        z: 0.38,
        widths: [
          0.78, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42,
          0.42, 0.78,
        ],
      },
      {
        z: 0.78,
        widths: [
          0.64, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42,
          0.64,
        ],
      },
      { z: 1.18, widths: [0.48, 0.55, 0.58, 0.72, 1.95, 0.72, 0.58, 0.48, 0.48] },
    ];

    rowSpecs.forEach((row) => {
      const gap = 0.065;
      const total =
        row.widths.reduce((sum, width) => sum + width, 0) +
        gap * (row.widths.length - 1);
      let x = -total / 2;

      row.widths.forEach((width, index) => {
        const key = roundedBox(width, 0.055, 0.25, 0.045, 6, darkKey);
        key.position.set(x + width / 2, 0, row.z);
        keyboard.add(key);

        if (index % 2 === 0 || width > 0.6) {
          const mark = panel(Math.min(width * 0.32, 0.18), 0.003, 0.018, keyLabel);
          mark.position.set(key.position.x, 0.031, row.z - 0.02);
          keyboard.add(mark);
        }

        x += width + gap;
      });
    });

    const touchId = roundedBox(0.26, 0.06, 0.26, 0.12, 16, black);
    touchId.position.set(2.73, 0.35, -1.38);
    root.add(touchId);

    const touchRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.105, 0.012, 12, 36),
      new THREE.MeshBasicMaterial({ color: 0xf4f4f2 }),
    );
    touchRing.rotation.x = Math.PI / 2;
    touchRing.position.set(2.73, 0.384, -1.38);
    root.add(touchRing);

    function createSpeaker(side: -1 | 1) {
      const group = new THREE.Group();
      const dotMaterial = new THREE.MeshBasicMaterial({
        color: 0xaab2ba,
        transparent: true,
        opacity: 0.62,
      });
      const dotGeo = new THREE.CircleGeometry(0.009, 8);

      for (let i = 0; i < 17; i++) {
        for (let j = 0; j < 22; j++) {
          if ((i + j) % 2 !== 0) continue;
          const dot = new THREE.Mesh(dotGeo, dotMaterial);
          dot.rotation.x = -Math.PI / 2;
          dot.position.set(i * 0.055, 0, j * 0.055);
          group.add(dot);
        }
      }

      group.position.set(side * 2.53 - (side > 0 ? 0.42 : 0.5), 0.315, -1.32);
      group.scale.x = side;
      return group;
    }
    root.add(createSpeaker(-1), createSpeaker(1));

    const hinge = new THREE.Group();
    hinge.position.set(0, 0.34, -1.98);
    root.add(hinge);

    const hingeBar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 4.7, 32),
      metal,
    );
    hingeBar.rotation.z = Math.PI / 2;
    hingeBar.castShadow = true;
    hingeBar.receiveShadow = true;
    hinge.add(hingeBar);

    const lid = new THREE.Group();
    lid.position.set(0, 0.34, -1.98);
    lid.rotation.x = -1.18;
    root.add(lid);

    const backShell = roundedBox(6.12, 3.62, 0.16, 0.14, 10, metal);
    backShell.position.set(0, 1.8, -0.08);
    lid.add(backShell);

    const displayBezel = roundedBox(5.82, 3.32, 0.075, 0.11, 10, black);
    displayBezel.position.set(0, 1.8, 0.022);
    lid.add(displayBezel);

    const screenCanvas = document.createElement("canvas");
    screenCanvas.width = 1024;
    screenCanvas.height = 560;
    const ctx = screenCanvas.getContext("2d");
    if (ctx) {
      const grad = ctx.createLinearGradient(0, 0, 1024, 560);
      grad.addColorStop(0, "#06111f");
      grad.addColorStop(0.34, "#123d80");
      grad.addColorStop(0.72, "#1bd3ff");
      grad.addColorStop(1, "#07101a");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1024, 560);
      ctx.globalAlpha = 0.34;
      for (let i = 0; i < 18; i++) {
        ctx.beginPath();
        ctx.arc(
          520 + Math.sin(i) * 210,
          280 + Math.cos(i * 1.6) * 130,
          80 + i * 4,
          0,
          Math.PI * 2,
        );
        ctx.strokeStyle = i % 2 ? "#7ff8ff" : "#224eff";
        ctx.lineWidth = 8;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(255,255,255,.92)";
      ctx.font = "bold 82px Arial";
      ctx.textAlign = "center";
      ctx.fillText("ZIRUI", 512, 295);
      ctx.font = "28px Arial";
      ctx.fillText("KONG", 512, 340);
    }

    const screenTexture = new THREE.CanvasTexture(screenCanvas);
    screenTexture.colorSpace = THREE.SRGBColorSpace;
    const screen = roundedBox(
      5.42,
      2.92,
      0.035,
      0.08,
      8,
      new THREE.MeshBasicMaterial({ map: screenTexture }),
    );
    screen.position.set(0, 1.8, 0.066);
    lid.add(screen);

    const glowPlane = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.2), screenGlow);
    glowPlane.position.set(0.3, 1.8, 0.09);
    lid.add(glowPlane);

    const cameraDot = new THREE.Mesh(
      new THREE.CircleGeometry(0.035, 18),
      new THREE.MeshBasicMaterial({ color: 0x111318 }),
    );
    cameraDot.position.set(0, 3.37, 0.071);
    lid.add(cameraDot);

    const logo = new THREE.Mesh(
      new THREE.CircleGeometry(0.28, 48),
      new THREE.MeshBasicMaterial({
        color: 0xf3f7fb,
        transparent: true,
        opacity: 0.5,
      }),
    );
    logo.position.set(0, 1.82, -0.166);
    logo.rotation.y = Math.PI;
    lid.add(logo);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 18),
      new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.26 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.025;
    floor.receiveShadow = true;
    scene.add(floor);

    scene.add(new THREE.HemisphereLight(0xbadfff, 0x07101a, 2.2));

    const keyLight = new THREE.DirectionalLight(0xffffff, 4.2);
    keyLight.position.set(4, 6, 5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    scene.add(keyLight);

    const cyanLight = new THREE.PointLight(0x55f5ff, 5, 10);
    cyanLight.position.set(-3.5, 1.8, 3.8);
    scene.add(cyanLight);

    const blueLight = new THREE.PointLight(0x315dff, 6, 12);
    blueLight.position.set(3.2, 4.2, -4.3);
    scene.add(blueLight);

    const rimLight = new THREE.DirectionalLight(0x9af8ff, 2.8);
    rimLight.position.set(-5, 2.2, -3);
    scene.add(rimLight);

    const blobs: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>[] = [];
    for (let i = 0; i < 4; i++) {
      const blob = new THREE.Mesh(
        new THREE.SphereGeometry(1.3 + i * 0.35, 32, 32),
        new THREE.MeshBasicMaterial({
          color: 0x35d4ff,
          transparent: true,
          opacity: 0.08,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      blob.position.set(-4 + i * 2.8, 0.5 + i * 0.35, -3.5 - i * 0.6);
      blob.scale.set(1.8, 0.55, 0.75);
      scene.add(blob);
      blobs.push(blob);
    }

    function resize() {
      const rect = stage.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    }

    resize();
    window.addEventListener("resize", resize);

    let frame = 0;
    let raf = 0;
    function animate() {
      frame += 0.01;
      root.position.y = Math.sin(frame) * 0.035;
      blobs.forEach((blob, index) => {
        blob.position.x += Math.sin(frame + index) * 0.0018;
        blob.material.opacity = 0.055 + Math.sin(frame * 1.4 + index) * 0.018;
      });
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    }

    animate();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      controls.dispose();
      renderer.dispose();
      scene.traverse((item) => {
        const mesh = item as THREE.Mesh;
        mesh.geometry?.dispose();
        const material = mesh.material;
        if (Array.isArray(material)) {
          material.forEach((entry) => entry.dispose());
        } else {
          material?.dispose();
        }
      });
    };
  }, []);

  return (
    <main className="macbook-3d-page">
      <style>{`
        .macbook-3d-page {
          position: relative;
          min-height: 100vh;
          overflow: hidden;
          background:
            radial-gradient(circle at 50% 38%, rgba(43, 99, 255, 0.38), transparent 27%),
            radial-gradient(circle at 13% 82%, rgba(59, 231, 255, 0.2), transparent 30%),
            radial-gradient(circle at 83% 78%, rgba(67, 255, 218, 0.16), transparent 28%),
            linear-gradient(135deg, #050c18 0%, #08192c 48%, #03111b 100%);
          color: white;
        }

        .macbook-3d-bg {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background:
            linear-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
          background-size: 72px 72px;
          mask-image: radial-gradient(circle at 50% 50%, black, transparent 72%);
          opacity: 0.32;
        }

        .macbook-3d-brand {
          position: fixed;
          top: 28px;
          left: 28px;
          z-index: 5;
          display: inline-flex;
          align-items: center;
          height: 46px;
          padding: 0 18px;
          border: 1px solid rgba(180, 226, 255, 0.22);
          border-radius: 999px;
          background: rgba(5, 14, 28, 0.36);
          color: rgba(245, 250, 255, 0.82);
          text-decoration: none;
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.12em;
          backdrop-filter: blur(16px);
        }

        .macbook-3d-hint {
          position: fixed;
          right: 28px;
          bottom: 24px;
          z-index: 5;
          color: rgba(235, 248, 255, 0.62);
          font-size: 13px;
          letter-spacing: 0.04em;
          pointer-events: none;
        }

        .macbook-3d-stage {
          position: relative;
          width: 100vw;
          height: 100vh;
          cursor: grab;
        }

        .macbook-3d-stage:active {
          cursor: grabbing;
        }

        .macbook-3d-canvas {
          display: block;
          width: 100%;
          height: 100%;
        }

        @media (max-width: 700px) {
          .macbook-3d-brand {
            top: 18px;
            left: 18px;
            height: 38px;
            padding: 0 14px;
            font-size: 11px;
          }

          .macbook-3d-hint {
            right: 18px;
            bottom: 18px;
            font-size: 12px;
          }
        }
      `}</style>
      <div className="macbook-3d-bg" />
      <a className="macbook-3d-brand" href="/">
        ZIRUI KONG
      </a>
      <div className="macbook-3d-hint">Drag to rotate</div>
      <div ref={mountRef} className="macbook-3d-stage">
        <canvas ref={canvasRef} className="macbook-3d-canvas" />
      </div>
    </main>
  );
}

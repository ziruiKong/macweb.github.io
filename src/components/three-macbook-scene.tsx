"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

const assetPath = (path: string) => `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${path}`;

type DragState = {
  active: boolean;
  pointerId: number;
  x: number;
  y: number;
};

const keyRows = [
  { count: 14, z: -0.28, xStep: 0.29, width: 0.23 },
  { count: 13, z: -0.05, xStep: 0.3, width: 0.24 },
  { count: 12, z: 0.18, xStep: 0.31, width: 0.25 },
  { count: 11, z: 0.41, xStep: 0.32, width: 0.26 },
  { count: 10, z: 0.64, xStep: 0.34, width: 0.27 },
];

const roundedBox = (
  width: number,
  height: number,
  depth: number,
  radius: number,
  segments = 5,
) => new RoundedBoxGeometry(width, height, depth, segments, radius);

export default function ThreeMacbookScene() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x061425, 8, 18);

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 2.55, 7.6);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const model = new THREE.Group();
    model.rotation.x = -0.08;
    scene.add(model);

    const silver = new THREE.MeshPhysicalMaterial({
      color: 0xe2e8ee,
      metalness: 0.72,
      roughness: 0.24,
      clearcoat: 0.72,
      clearcoatRoughness: 0.16,
    });
    const silverDark = new THREE.MeshPhysicalMaterial({
      color: 0xcbd3dc,
      metalness: 0.72,
      roughness: 0.3,
      clearcoat: 0.46,
      clearcoatRoughness: 0.22,
    });
    const dark = new THREE.MeshStandardMaterial({
      color: 0x050507,
      roughness: 0.58,
      metalness: 0.16,
    });
    const blackPlastic = new THREE.MeshStandardMaterial({
      color: 0x010103,
      roughness: 0.44,
      metalness: 0.08,
    });

    const base = new THREE.Mesh(roundedBox(5.7, 0.2, 3.52, 0.18, 8), silver);
    base.position.set(0, 0, 0.42);
    base.castShadow = true;
    base.receiveShadow = true;
    model.add(base);

    const frontLip = new THREE.Mesh(roundedBox(5.18, 0.08, 0.12, 0.055, 5), silverDark);
    frontLip.position.set(0, -0.09, 2.18);
    frontLip.castShadow = true;
    model.add(frontLip);

    const keyboardWell = new THREE.Mesh(
      roundedBox(4.72, 0.024, 1.42, 0.1, 6),
      new THREE.MeshPhysicalMaterial({
        color: 0xd7dde4,
        metalness: 0.5,
        roughness: 0.34,
        clearcoat: 0.36,
      }),
    );
    keyboardWell.position.set(0, 0.115, 0.18);
    keyboardWell.receiveShadow = true;
    model.add(keyboardWell);

    const trackpad = new THREE.Mesh(
      roundedBox(1.68, 0.024, 0.94, 0.08, 6),
      new THREE.MeshPhysicalMaterial({
        color: 0xe6ecf2,
        metalness: 0.35,
        roughness: 0.22,
        clearcoat: 0.82,
      }),
    );
    trackpad.position.set(0, 0.128, 1.18);
    trackpad.receiveShadow = true;
    model.add(trackpad);

    const screenGroup = new THREE.Group();
    screenGroup.position.set(0, 0.18, -1.22);
    screenGroup.rotation.x = -1.02;
    model.add(screenGroup);

    const screenLid = new THREE.Mesh(roundedBox(5.58, 0.15, 3.32, 0.16, 9), silver);
    screenLid.castShadow = true;
    screenLid.receiveShadow = true;
    screenGroup.add(screenLid);

    const screenBezel = new THREE.Mesh(roundedBox(5.26, 0.046, 2.98, 0.13, 8), blackPlastic);
    screenBezel.position.set(0, -0.092, 0.02);
    screenGroup.add(screenBezel);

    const webcam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 0.012, 24),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.38 }),
    );
    webcam.rotation.x = Math.PI / 2;
    webcam.position.set(0, -0.121, -1.33);
    screenGroup.add(webcam);

    const textureLoader = new THREE.TextureLoader();
    const screenTexture = textureLoader.load(assetPath("/glacial-blue-wallpaper-1920.webp"));
    screenTexture.colorSpace = THREE.SRGBColorSpace;
    const screenImage = new THREE.Mesh(
      new THREE.PlaneGeometry(4.82, 2.72),
      new THREE.MeshBasicMaterial({ map: screenTexture }),
    );
    screenImage.position.set(0, -0.111, 0.025);
    screenImage.rotation.x = -Math.PI / 2;
    screenGroup.add(screenImage);

    const screenGloss = new THREE.Mesh(
      new THREE.PlaneGeometry(4.82, 2.72),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.06,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    screenGloss.position.set(0, -0.113, 0.029);
    screenGloss.rotation.x = -Math.PI / 2;
    screenGroup.add(screenGloss);

    const keyGeometry = roundedBox(1, 0.055, 0.165, 0.035, 4);
    keyRows.forEach((row) => {
      const startX = -((row.count - 1) * row.xStep) / 2;
      for (let index = 0; index < row.count; index += 1) {
        const key = new THREE.Mesh(keyGeometry, blackPlastic);
        key.scale.set(row.width, 1, 1);
        key.position.set(startX + index * row.xStep, 0.165, row.z);
        key.castShadow = true;
        key.receiveShadow = true;
        model.add(key);
      }
    });

    const spaceKey = new THREE.Mesh(roundedBox(1.55, 0.055, 0.165, 0.035, 4), blackPlastic);
    spaceKey.position.set(0, 0.168, 0.88);
    spaceKey.castShadow = true;
    model.add(spaceKey);

    const speakerDotMaterial = new THREE.MeshStandardMaterial({
      color: 0x718092,
      metalness: 0.15,
      roughness: 0.7,
    });
    const speakerDotGeometry = new THREE.CylinderGeometry(0.012, 0.012, 0.01, 12);
    const addSpeakerGrid = (side: "left" | "right") => {
      const xStart = side === "left" ? -2.45 : 2.0;
      for (let col = 0; col < 9; col += 1) {
        for (let row = 0; row < 15; row += 1) {
          const dot = new THREE.Mesh(speakerDotGeometry, speakerDotMaterial);
          dot.position.set(xStart + col * 0.05, 0.142, -0.34 + row * 0.08);
          dot.rotation.x = Math.PI / 2;
          model.add(dot);
        }
      }
    };
    addSpeakerGrid("left");
    addSpeakerGrid("right");

    const touchId = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 0.035, 36),
      new THREE.MeshPhysicalMaterial({
        color: 0x050505,
        roughness: 0.28,
        metalness: 0.65,
        clearcoat: 0.7,
      }),
    );
    touchId.rotation.x = Math.PI / 2;
    touchId.position.set(2.22, 0.18, -0.31);
    model.add(touchId);

    const makeSticker = (src: string, x: number, z: number, size: number, rotation: number) => {
      const texture = textureLoader.load(assetPath(src));
      texture.colorSpace = THREE.SRGBColorSpace;
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
      });
      const sticker = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
      sticker.rotation.x = -Math.PI / 2;
      sticker.rotation.z = rotation;
      sticker.position.set(x, 0.235, z);
      model.add(sticker);
    };

    makeSticker("/zirui-sticker-small.png", -1.72, 1.48, 0.46, -0.18);
    makeSticker("/ohio-sticker-small.png", -2.2, 1.78, 0.42, 0.24);
    makeSticker("/georgia-sticker-small.png", -1.28, 1.82, 0.5, -0.08);
    makeSticker("/messi-sticker-small.png", 1.58, 1.52, 0.56, 0.2);
    makeSticker("/bear-sticker-small.png", 2.24, 1.45, 0.52, -0.08);

    const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 4.78, 48), dark);
    hinge.rotation.z = Math.PI / 2;
    hinge.position.set(0, 0.2, -1.25);
    hinge.castShadow = true;
    model.add(hinge);

    const hingeCapLeft = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.088, 0.28, 32), silverDark);
    hingeCapLeft.rotation.z = Math.PI / 2;
    hingeCapLeft.position.set(-2.55, 0.2, -1.25);
    model.add(hingeCapLeft);

    const hingeCapRight = hingeCapLeft.clone();
    hingeCapRight.position.x = 2.55;
    model.add(hingeCapRight);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 18),
      new THREE.ShadowMaterial({ color: 0x00152a, opacity: 0.28 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.18;
    floor.receiveShadow = true;
    scene.add(floor);

    const ambient = new THREE.AmbientLight(0x9fdcff, 1.4);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xdff8ff, 2.8);
    keyLight.position.set(-3, 5, 5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    scene.add(keyLight);

    const rimLight = new THREE.PointLight(0x22d3ee, 12, 9);
    rimLight.position.set(3.2, 2.2, -1.5);
    scene.add(rimLight);

    const backGlow = new THREE.PointLight(0x1d4ed8, 10, 12);
    backGlow.position.set(-2, 1.8, -3);
    scene.add(backGlow);

    const drag: DragState = {
      active: false,
      pointerId: -1,
      x: 0,
      y: 0,
    };
    const targetRotation = { x: -0.08, y: -0.34 };
    const currentRotation = { x: -0.08, y: -0.34 };

    const handlePointerDown = (event: PointerEvent) => {
      drag.active = true;
      drag.pointerId = event.pointerId;
      drag.x = event.clientX;
      drag.y = event.clientY;
      renderer.domElement.setPointerCapture(event.pointerId);
      renderer.domElement.classList.add("cursor-grabbing");
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!drag.active || drag.pointerId !== event.pointerId) return;
      const deltaX = event.clientX - drag.x;
      const deltaY = event.clientY - drag.y;
      drag.x = event.clientX;
      drag.y = event.clientY;
      targetRotation.y += deltaX * 0.008;
      targetRotation.x = THREE.MathUtils.clamp(targetRotation.x + deltaY * 0.004, -0.42, 0.28);
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (drag.pointerId !== event.pointerId) return;
      drag.active = false;
      drag.pointerId = -1;
      renderer.domElement.releasePointerCapture(event.pointerId);
      renderer.domElement.classList.remove("cursor-grabbing");
    };

    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);
    renderer.domElement.addEventListener("pointercancel", handlePointerUp);

    const resize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };

    resize();
    window.addEventListener("resize", resize);

    let animationFrame = 0;
    const clock = new THREE.Clock();
    const animate = () => {
      const elapsed = clock.getElapsedTime();
      currentRotation.x = THREE.MathUtils.lerp(currentRotation.x, targetRotation.x, 0.1);
      currentRotation.y = THREE.MathUtils.lerp(currentRotation.y, targetRotation.y, 0.1);
      model.rotation.x = currentRotation.x + Math.sin(elapsed * 0.7) * 0.012;
      model.rotation.y = currentRotation.y + Math.sin(elapsed * 0.45) * 0.018;
      model.rotation.z = Math.sin(elapsed * 0.52) * 0.006;
      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      renderer.domElement.removeEventListener("pointercancel", handlePointerUp);
      screenTexture.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => {
            const maybeMap = material as THREE.Material & { map?: THREE.Texture };
            maybeMap.map?.dispose();
            material.dispose();
          });
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <main className="three-mac-page">
      <div className="three-mac-background" aria-hidden="true" />
      <div ref={containerRef} className="three-mac-canvas-shell" />
      <Link className="three-mac-back" href="/" aria-label="Back to homepage">
        ZIRUI KONG
      </Link>
    </main>
  );
}

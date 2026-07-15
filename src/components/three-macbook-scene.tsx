"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import * as THREE from "three";

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
      color: 0xdfe6ee,
      metalness: 0.72,
      roughness: 0.28,
      clearcoat: 0.55,
      clearcoatRoughness: 0.2,
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

    const base = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.18, 3.45), silver);
    base.position.set(0, 0, 0.42);
    base.castShadow = true;
    base.receiveShadow = true;
    model.add(base);

    const frontLip = new THREE.Mesh(new THREE.BoxGeometry(5.15, 0.12, 0.12), silver);
    frontLip.position.set(0, -0.08, 2.18);
    frontLip.castShadow = true;
    model.add(frontLip);

    const trackpad = new THREE.Mesh(
      new THREE.BoxGeometry(1.65, 0.018, 0.92),
      new THREE.MeshPhysicalMaterial({
        color: 0xe9eef4,
        metalness: 0.35,
        roughness: 0.22,
        clearcoat: 0.7,
      }),
    );
    trackpad.position.set(0, 0.11, 1.15);
    trackpad.receiveShadow = true;
    model.add(trackpad);

    const screenGroup = new THREE.Group();
    screenGroup.position.set(0, 0.18, -1.22);
    screenGroup.rotation.x = -1.02;
    model.add(screenGroup);

    const screenShell = new THREE.Mesh(new THREE.BoxGeometry(5.52, 0.16, 3.3), dark);
    screenShell.castShadow = true;
    screenShell.receiveShadow = true;
    screenGroup.add(screenShell);

    const screenBezel = new THREE.Mesh(new THREE.BoxGeometry(5.22, 0.04, 2.95), blackPlastic);
    screenBezel.position.set(0, -0.085, 0.02);
    screenGroup.add(screenBezel);

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

    const keyGeometry = new THREE.BoxGeometry(1, 0.06, 0.16);
    const keyMeshes: THREE.Mesh[] = [];
    keyRows.forEach((row) => {
      const startX = -((row.count - 1) * row.xStep) / 2;
      for (let index = 0; index < row.count; index += 1) {
        const key = new THREE.Mesh(keyGeometry, blackPlastic);
        key.scale.set(row.width, 1, 1);
        key.position.set(startX + index * row.xStep, 0.14, row.z);
        key.castShadow = true;
        key.receiveShadow = true;
        keyMeshes.push(key);
        model.add(key);
      }
    });

    const spaceKey = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.06, 0.16), blackPlastic);
    spaceKey.position.set(0, 0.145, 0.88);
    spaceKey.castShadow = true;
    model.add(spaceKey);

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

    const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4.7, 36), dark);
    hinge.rotation.z = Math.PI / 2;
    hinge.position.set(0, 0.2, -1.25);
    hinge.castShadow = true;
    model.add(hinge);

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

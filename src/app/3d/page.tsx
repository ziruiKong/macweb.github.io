import type { Metadata } from "next";
import ThreeMacbookScene from "@/components/three-macbook-scene";

export const metadata: Metadata = {
  title: "3D MacBook | ZIRUI KONG",
  description: "Interactive Three.js MacBook model.",
};

export default function ThreeDPage() {
  return <ThreeMacbookScene />;
}


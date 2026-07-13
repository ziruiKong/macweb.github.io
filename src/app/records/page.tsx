import type { Metadata } from "next";
import { RecordsWall } from "@/components/records-wall";

export const metadata: Metadata = {
  title: "Records Wall | ZIRUI KONG",
  description: "A personal interactive records wall by Zirui Kong.",
};

export default function RecordsPage() {
  return <RecordsWall />;
}

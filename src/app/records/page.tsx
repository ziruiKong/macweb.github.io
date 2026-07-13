import type { Metadata } from "next";
import { RecordsWall } from "@/components/records-wall";

export const metadata: Metadata = {
  title: "Records | ZIRUI KONG",
  description: "Interactive record covers by Zirui Kong.",
};

export default function RecordsPage() {
  return <RecordsWall />;
}

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Desk } from "@/components/lab/b/Desk";
import { loadLab } from "../load";

const sans = Geist({ subsets: ["latin"], variable: "--b-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--b-mono" });

export const metadata: Metadata = { title: "Lab B · Desk", robots: { index: false } };

export default async function LabB({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { data, seek } = await loadLab(searchParams);
  return (
    <div className={`${sans.variable} ${mono.variable}`}>
      <Desk data={data} seek={seek} />
    </div>
  );
}

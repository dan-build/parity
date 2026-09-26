import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { Hallmark } from "@/components/lab/a/Hallmark";
import { loadLab } from "../load";

const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", variable: "--a-serif" });
const sans = Geist({ subsets: ["latin"], variable: "--a-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--a-mono" });

export const metadata: Metadata = { title: "Lab A · Hallmark", robots: { index: false } };

export default async function LabA({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { data, seek } = await loadLab(searchParams);
  return (
    <div className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
      <Hallmark data={data} seek={seek} />
    </div>
  );
}

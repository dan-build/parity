import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { Field } from "@/components/lab/c/Field";
import { loadLab } from "../load";

const sans = Inter({ subsets: ["latin"], variable: "--c-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--c-mono" });

export const metadata: Metadata = { title: "Lab C · Field", robots: { index: false } };

export default async function LabC({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { data, seek } = await loadLab(searchParams);
  return (
    <div className={`${sans.variable} ${mono.variable}`}>
      <Field data={data} seek={seek} />
    </div>
  );
}

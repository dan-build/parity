import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });

// Data, labels and the log.
const geistMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-geist-mono",
  display: "swap",
});

/** Absolute base for OG image URLs: SITE_URL if set, else Vercel's production or deployment URL. */
function siteUrl(): URL {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  return new URL(process.env.SITE_URL ?? (host ? `https://${host}` : "http://localhost:3000"));
}

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: "Parity: is your tokenised asset actually the thing?",
  description: "Type a ticker. See every token that claims to be it, whether it's fairly priced, and whether you can sell it later.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0F0F10",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}

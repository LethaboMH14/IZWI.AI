import type { Metadata } from "next";
import { Fraunces, Martian_Mono } from "next/font/google";
import "./globals.css";
import "./app.css";
import "./platform.css";

// Fraunces is self-hosted at build time by next/font: no request to Google from the visitor's browser.
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], style: ["normal", "italic"], axes: ["SOFT", "opsz"], display: "swap" });
const mono = Martian_Mono({ variable: "--font-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "IZWI AI",
  description: "Turn one story into many. A creative workspace for South African creators.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-ZA" className={`${fraunces.variable} ${mono.variable}`}>
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=switzer@400,500,600&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}

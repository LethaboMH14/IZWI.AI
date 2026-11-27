import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { Fraunces, Geist_Mono, Instrument_Sans } from "next/font/google";
import "./globals.css";
import "./tokens.css";
import "./app.css";
import "./platform.css";
import "./z.css";

// All three faces are self-hosted at build time by next/font: no request leaves the visitor's browser.
// Fraunces carries titles, Instrument Sans the interface, Geist Mono every timecode (docs/design/DESIGN-SYSTEM.md).
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], style: ["normal", "italic"], axes: ["SOFT", "opsz"], display: "swap" });
const ui = Instrument_Sans({ variable: "--font-ui", subsets: ["latin"], display: "swap" });
const time = Geist_Mono({ variable: "--font-time", subsets: ["latin"], weight: ["400", "500"], display: "swap" });

export const metadata: Metadata = {
  title: "IZWI AI",
  description: "Turn one story into many. A creative workspace for South African creators.",
};

export const viewport: Viewport = {
  themeColor: "#241d1b",
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Render per request, so every page carries this request's CSP nonce (src/proxy.ts). Static pages would have none.
  await connection();
  return (
    <html lang="en-ZA" className={`${fraunces.variable} ${ui.variable} ${time.variable}`}>
      <body>{children}</body>
    </html>
  );
}

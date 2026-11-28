import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Chakra_Petch, IBM_Plex_Mono, Inter, Silkscreen } from "next/font/google";

import { ServiceWorkerRegister } from "@/components/notifications/sw-register";

import "./globals.css";

// Redesign 2026-11-28: Bricolage for big type, Inter for reading, Plex Mono for numbers.
// Chakra Petch + Silkscreen only appear in the Quest view, so they aren't preloaded.
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", display: "swap", weight: ["600", "800"] });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], variable: "--font-plex-mono", display: "swap", weight: ["400", "500"] });
const chakra = Chakra_Petch({ subsets: ["latin"], variable: "--font-chakra", display: "swap", weight: ["500", "700"], preload: false });
const silkscreen = Silkscreen({ subsets: ["latin"], variable: "--font-silkscreen", display: "swap", weight: "400", preload: false });

export const metadata: Metadata = {
  title: { default: "HQ", template: "%s · HQ" },
  description: "Ridwan's HQ — one thing at a time. An early version of LifeQuest.",
  robots: { index: false, follow: false },
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "HQ", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#0b1020", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bricolage.variable} ${inter.variable} ${mono.variable} ${chakra.variable} ${silkscreen.variable}`}>
      <body className="min-h-dvh">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}

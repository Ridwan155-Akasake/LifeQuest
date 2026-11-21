import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Lora } from "next/font/google";

import { ServiceWorkerRegister } from "@/components/notifications/sw-register";

import "./globals.css";

// Same type pairing as ridwansharif.com so the subdomain feels like the same site.
const lora = Lora({ subsets: ["latin"], variable: "--font-lora", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  title: { default: "HQ", template: "%s · HQ" },
  description: "Ridwan's HQ — tasks, habits, reminders. An early version of LifeQuest.",
  robots: { index: false, follow: false },
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "HQ", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#070a12", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${lora.variable} ${mono.variable}`} data-accent="cyan">
      <body className="min-h-dvh">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}

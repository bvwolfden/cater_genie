import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { DraftBanner } from "@/components/DraftBanner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "CaterGenie — Daily Operations",
  description:
    "Unified daily dashboard for retail, delivery, labor, and cash — powered by automated ingestion and AI insights.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const tree = (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="font-sans">
        <DraftBanner />
        {children}
      </body>
    </html>
  );
  // Only mount Clerk when configured, so the app runs without auth keys.
  return process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? <ClerkProvider>{tree}</ClerkProvider> : tree;
}

import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { Inter, JetBrains_Mono } from "next/font/google";

import { Shell } from "@/components/shell";
import { WalletProvider } from "@/lib/wallet";

import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jbmono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jbmono" });

export const metadata: Metadata = {
  title: "ReverseSpec — Solve the Better Problem",
  description:
    "Bounties that reward discovering and solving the deeper problem, " +
    "adjudicated by GenLayer Intelligent Contract consensus.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({
  children,
}: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${GeistSans.variable} ${inter.variable} ${jbmono.variable} bg-background font-body text-body text-ink antialiased`}
      >
        <WalletProvider>
          <Shell>{children}</Shell>
        </WalletProvider>
      </body>
    </html>
  );
}

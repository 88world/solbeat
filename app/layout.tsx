import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "SolBeat — The pulse of every Solana token, in plain English",
  description:
    "Paste any Solana contract. Get real-time on-chain data, X sentiment, and recent catalysts synthesized into a plain-English read by AI. Built by Block Valley Labs for the Solana Frontier Hackathon.",
  applicationName: "SolBeat",
  authors: [{ name: "Block Valley Labs" }],
  keywords: [
    "Solana",
    "SolBeat",
    "Block Valley",
    "token analysis",
    "DEXScreener alternative",
    "Jupiter swap",
    "Solana memecoins",
    "AI",
  ],
  openGraph: {
    title: "SolBeat — The pulse of every Solana token",
    description: "Paste any CA. Read the pulse.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "SolBeat — The pulse of every Solana token",
    description: "Paste any CA. Read the pulse.",
  },
  icons: {
    icon: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

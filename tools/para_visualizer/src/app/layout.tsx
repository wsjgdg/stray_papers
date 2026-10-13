import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dataset Image Browser",
  description: "Browse, filter, compare, and export images embedded in .arrow / .parquet datasets — 100% in your browser.",
  keywords: ["Arrow", "Parquet", "dataset", "image browser", "InfoChartQA", "Next.js"],
  authors: [{ name: "Dataset Image Browser" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "Dataset Image Browser",
    description: "Browse images inside Arrow & Parquet datasets — 100% client-side.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
        <SonnerToaster richColors position="bottom-right" closeButton />
      </body>
    </html>
  );
}

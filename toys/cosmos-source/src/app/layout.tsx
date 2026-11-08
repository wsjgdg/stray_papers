import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "宇宙模拟器 · Cosmos Orrery — 太阳系到可观测宇宙",
  description: "一个交互式 3D 宇宙模拟器：从太阳系行星轨道、近邻恒星、银河系旋臂，一路放大到本星系群、超星系团网络与可观测宇宙的微波背景。",
  keywords: ["宇宙模拟器", "太阳系", "三体", "Three.js", "天文", "星系", "可观测宇宙", "Cosmos", "Orrery"],
  openGraph: {
    title: "宇宙模拟器 · Cosmos Orrery",
    description:
      "一个交互式 3D 宇宙模拟器：从太阳系行星轨道、近邻恒星、银河系旋臂，一路放大到本星系群、超星系团网络与可观测宇宙的微波背景。",
    type: "website",
    siteName: "Cosmos Orrery",
  },
  twitter: {
    card: "summary_large_image",
    title: "宇宙模拟器 · Cosmos Orrery",
    description:
      "一个交互式 3D 宇宙模拟器：从太阳系行星轨道一路放大到可观测宇宙。",
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
      </body>
    </html>
  );
}

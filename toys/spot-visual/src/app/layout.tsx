import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { TopNav } from "@/components/top-nav";

export const metadata: Metadata = {
  title: "华夏探索 · 1024 造物节 · 多功能文旅应用",
  description: "景点览胜 · 中国味道 · 志愿探索 —— 用 WorkBuddy 打造的可体验多功能应用",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased bg-gray-50 text-gray-900">
        <Suspense fallback={<div className="h-[52px] border-b border-gray-200/80 bg-white/85" />}>
          <TopNav />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
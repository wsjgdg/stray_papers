import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "景点览胜 - 景点可视化平台",
  description: "探索全国精选景点，支持 JSON 数据导入与可视化展示",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased bg-gray-50 text-gray-900">
        {children}
      </body>
    </html>
  );
}
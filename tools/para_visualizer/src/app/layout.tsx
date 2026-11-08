import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "sonner";

export const metadata: Metadata = {
  title: "Dataset Image Browser",
  description: "Browse, filter, compare, and export images embedded in .arrow / .parquet datasets — 100% in your browser.",
  keywords: ["Arrow", "Parquet", "dataset", "image browser", "InfoChartQA", "Next.js"],
  authors: [{ name: "Dataset Image Browser" }],
  icons: {
    icon: "/favicon.svg",
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
        className="antialiased bg-background text-foreground"
      >
        {children}
        <Toaster />
        <SonnerToaster richColors position="bottom-right" closeButton />
      </body>
    </html>
  );
}

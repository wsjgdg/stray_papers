import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { QueryProvider } from "@/components/query-provider";
import { I18nProvider } from "@/components/i18n/provider";
import { ThemeProvider } from "@/components/theme-provider";
import { ProjectProvider } from "@/components/project-provider";
import { AuthProvider } from "@/components/auth-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Absolute base URL used to resolve the relative Open Graph / Twitter image
// paths below. Without `metadataBase` Next.js falls back to
// http://localhost:3000 and warns on every boot.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "MatLit Miner · AI Literature Mining for Materials Science",
  description:
    "AI-assisted workflow for batch retrieval, LLM classification, and deep extraction of material science literature with DOI-linked evidence.",
  applicationName: "MatLit Miner",
  keywords: [
    "MatLit Miner",
    "material science",
    "literature mining",
    "Semantic Scholar",
    "perovskite",
    "solar cell",
    "LLM extraction",
    "DOI verification",
  ],
  authors: [{ name: "MatLit Miner" }],
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    shortcut: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
  openGraph: {
    title: "MatLit Miner · AI Literature Mining for Materials Science",
    description:
      "AI-assisted workflow for batch retrieval, LLM classification, and data extraction of solar cell materials.",
    type: "website",
    locale: "en_US",
    siteName: "MatLit Miner",
    images: [
      {
        url: "/icon.svg",
        width: 64,
        height: 64,
        alt: "MatLit Miner logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "MatLit Miner · AI Literature Mining for Materials Science",
    description:
      "AI-assisted workflow for batch retrieval, LLM classification, and data extraction of solar cell materials.",
    images: ["/icon.svg"],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#10b981" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

/**
 * T10 — JSON-LD structured data for the application.
 *
 * Rendered as a `<script type="application/ld+json">` block in `<head>` so
 * search engines and research aggregators can index the site as a
 * ScienceApplication. Inline the object (rather than pull from a remote file)
 * so the markup ships with the first HTML byte and is available to crawlers
 * without executing client JS.
 */
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "MatLit Miner",
  description:
    "AI-assisted literature mining for materials science — batch retrieval, LLM classification, and deep extraction of solar-cell / perovskite literature with DOI-linked evidence.",
  applicationCategory: "ScienceApplication",
  operatingSystem: "Web",
  url: "https://matlit.example.com",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  featureList: [
    "Multi-source literature search (Semantic Scholar, Crossref, OpenAlex, Unpaywall)",
    "LLM-based paper classification and material extraction",
    "DOI verification and provenance tracking",
    "Phase-diagram VLM analysis",
    "Citation network and efficiency benchmarking",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <meta name="apple-mobile-web-app-title" content="MatLit Miner" />
        <meta name="mobile-web-app-capable" content="yes" />
        {/* T10: JSON-LD structured data — see `jsonLd` above. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <QueryProvider>
          <I18nProvider>
            <ThemeProvider>
              <AuthProvider>
                <ProjectProvider>
                  {children}
                </ProjectProvider>
              </AuthProvider>
            </ThemeProvider>
          </I18nProvider>
        </QueryProvider>
        <Toaster />
        <SonnerToaster richColors closeButton position="top-right" />
        {/* T3: PWA service worker registration.
            Registered on `load` so it never competes with first-paint
            bandwidth. The SW itself (public/sw.js) caches the app shell
            for instant repeat visits and serves API GETs network-first
            with cache fallback so the app keeps working offline. The
            `.catch(() => {})` swallows registration errors silently —
            the app works fine without the SW (it's pure enhancement),
            and noisy console errors during dev would be annoying. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})})}`,
          }}
        />
      </body>
    </html>
  );
}

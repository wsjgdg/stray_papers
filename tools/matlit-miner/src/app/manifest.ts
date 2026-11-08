import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MatLit Miner - AI Literature Mining for Materials Science",
    short_name: "MatLit Miner",
    description:
      "AI-assisted workflow for batch retrieval, LLM classification, and data extraction of solar cell materials.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#10b981",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}

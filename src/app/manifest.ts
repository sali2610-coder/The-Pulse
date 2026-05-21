import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sally — Smart Expense Tracker",
    short_name: "Sally",
    description: "מעקב הוצאות חכם בזמן אמת",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0A0A0A",
    theme_color: "#0A0A0A",
    lang: "he",
    dir: "rtl",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon-maskable.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
    categories: ["finance", "productivity"],
    // PWA app-shortcuts surface on long-press of the home-screen icon
    // on iOS 16.4+ and Android. "Quick capture" launches the
    // dedicated /quick-add route — bypasses the dashboard entirely so
    // logging an expense is one tap → 3 seconds.
    shortcuts: [
      {
        name: "תיעוד הוצאה",
        short_name: "הוצאה",
        description: "תיעוד הוצאה מהיר בלי לפתוח את הדשבורד",
        url: "/quick-add",
        icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
      },
    ],
  };
}

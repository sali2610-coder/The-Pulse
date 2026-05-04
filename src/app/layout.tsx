import type { Metadata, Viewport } from "next";
import { Heebo, Geist, Geist_Mono } from "next/font/google";
import { Providers } from "./providers";
import { RegisterSW } from "@/components/pwa/register-sw";
import "./globals.css";

// Heebo handles Hebrew glyphs — keep it as the body font.
// Geist Sans is layered on top for Latin text and gives the elite fintech
// feel called out in the design audit. Geist Mono replaces JetBrains Mono
// for tabular numerals.
const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
  display: "swap",
});

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
  title: "Sally — מעקב הוצאות חכם",
  description: "תיעוד הוצאות מהיר ויוקרתי בעברית",
  applicationName: "Sally",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Sally",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0A0A0A",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="he"
      dir="rtl"
      className={`${heebo.variable} ${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Providers>{children}</Providers>
        <RegisterSW />
      </body>
    </html>
  );
}

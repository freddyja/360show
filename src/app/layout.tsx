import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/Providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "360show — Photo booth operator",
  description:
    "Tablet-first 360 photo booth operator app. Capture spins, preview a live time-ramp, and share a baked slow-mo clip with QR.",
  applicationName: "360show",
  appleWebApp: {
    capable: true,
    title: "360show",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#db2777",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="booth-root">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased font-sans min-h-dvh`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

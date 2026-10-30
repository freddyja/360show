import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "360show — Tablet remote",
  manifest: "/tablet.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Booth Remote",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#07101c",
};

export default function TabletLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

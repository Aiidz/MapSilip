import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Montserrat } from "next/font/google";
import "./globals.css";
import { InstallPromptCapture } from "./components/InstallPromptCapture";

const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MapSilip",
  description: "A thoughtful home base for dormitory life.",
  applicationName: "MapSilip",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/mapsilip-logo-mark.svg",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f6f7f9",
};

export default function RootLayout(
  { children }: Readonly<{ children: ReactNode }>,
) {
  return (
    <html lang="en">
      <body className={montserrat.variable}><InstallPromptCapture />{children}</body>
    </html>
  );
}

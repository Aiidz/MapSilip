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
  themeColor: "#171c22",
};

const themeInitScript = `(function(){try{var s=localStorage.getItem('mapsilip-theme');var t=(s==='light'||s==='dark')?s:'dark';document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='dark';}})();`;

export default function RootLayout(
  { children }: Readonly<{ children: ReactNode }>,
) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={montserrat.variable}><InstallPromptCapture />{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "Georgetown Medical Interpreters",
  description: "Georgetown Medical Interpreters provides free medical interpretation services at clinics across the DMV area, staffed by trained bilingual Georgetown students.",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
  openGraph: {
    title: "Georgetown Medical Interpreters",
    description: "Free medical interpretation services across the DMV, provided by trained Georgetown student volunteers.",
    url: "https://georgetownmedicalinterpreters.com",
    siteName: "Georgetown Medical Interpreters",
    images: [{ url: "/icon.svg", width: 512, height: 512, alt: "Georgetown Medical Interpreters" }],
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
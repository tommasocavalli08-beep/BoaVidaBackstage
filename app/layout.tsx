import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BoaVida · Backstage",
  applicationName: "BoaVida Backstage",
  description: "Il backstage di BoaVida. Liste, tavoli e inviti per la tua serata.",
  robots: { index: false, follow: false },
  icons: {
    icon: [{ url: "/brand/boavida-app-192.png", type: "image/png", sizes: "192x192" }],
    shortcut: "/brand/boavida-app-192.png",
    apple: [{ url: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" }],
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "BoaVida", statusBarStyle: "black-translucent" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}

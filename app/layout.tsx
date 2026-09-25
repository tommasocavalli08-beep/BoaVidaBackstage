import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BoaVida · Backstage",
  description: "Il backstage di BoaVida. Liste, tavoli e inviti per la tua serata.",
  robots: { index: false, follow: false },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
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

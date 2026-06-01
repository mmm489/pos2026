import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hi Cream POS",
  description: "POS y KDS para Hi Cream - Heladería en Salou",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ca" className={GeistSans.className}>
      <body className="antialiased">{children}</body>
    </html>
  );
}

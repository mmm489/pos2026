import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hi Cream POS",
  other: {
    google: "notranslate",
  },
  description: "POS y KDS para Hi Cream - Heladería en Salou",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ca" translate="no" className={GeistSans.className}>
      <body className="notranslate antialiased" translate="no">
        {children}
      </body>
    </html>
  );
}

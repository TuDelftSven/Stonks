import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stonks Portfolio",
  description: "Private DEGIRO portfolio analytics with MWRR, CAGR, holdings, income, and costs.",
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
    <html lang="en"><body>{children}</body></html>
  );
}

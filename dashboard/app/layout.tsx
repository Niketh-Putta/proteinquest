import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ProteinQuest Growth OS",
  description: "Private growth, activation, revenue and retention command centre for ProteinQuest.",
  robots: { index: false, follow: false, nocache: true },
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}

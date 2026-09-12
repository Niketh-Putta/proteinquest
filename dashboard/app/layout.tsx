import type { Metadata } from "next";
import { AppChrome } from "@/components/app-chrome";
import "./globals.css";
import "./monochrome.css";

export const metadata: Metadata = {
  title: "ProteinQuest Growth OS",
  description: "Private growth, activation, revenue and retention command centre for ProteinQuest.",
  robots: { index: false, follow: false, nocache: true },
  icons: { icon: "/proteinquest-logo.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  );
}

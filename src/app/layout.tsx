import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "remixicon/fonts/remixicon.css";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sales CRM",
  description: "Sales CRM",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html suppressHydrationWarning lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

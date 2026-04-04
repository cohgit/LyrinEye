import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LyrinEye Admin",
  description: "Sistema de monitoreo avanzado",
};

import LoggerInitializer from "./components/LoggerInitializer";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  try {
    return (
      <html lang="en">
        <body
          className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        >
          <LoggerInitializer />
          {children}
        </body>
      </html>
    );
  } catch (error: any) {
    return (
      <html lang="en">
        <body className="bg-slate-900 text-white p-10 font-mono text-sm">
          <h1 className="text-red-500 font-bold mb-4">CRITICAL RENDER ERROR</h1>
          <p>{error.message || "Unknown rendering error"}</p>
          {error.stack && <pre className="mt-4 text-xs opacity-50 overflow-auto">{error.stack}</pre>}
        </body>
      </html>
    );
  }
}

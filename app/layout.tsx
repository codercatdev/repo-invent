import type { Metadata, Viewport } from "next";
import { Nunito, Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["700", "800", "900"],
});

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "repo:Invent — Gamified AWS re:Invent 2026 Companion & Repo Planner",
  description:
    "Scan your GitHub repository, level up your AWS architecture, plan a walkable re:Invent 2026 week, explore 171 Vegas parties, and chat with the live AWS Events MCP agent.",
  applicationName: "repo:Invent",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#58cc02",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${plusJakarta.variable} ${nunito.variable} ${jetbrainsMono.variable} min-h-dvh bg-background font-sans text-foreground antialiased`}
      >
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          <AppShell>{children}</AppShell>
          <Toaster position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}

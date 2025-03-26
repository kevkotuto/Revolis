import type { Metadata } from "next";
import { Ubuntu } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner"
import { NextAuthProvider } from "@/providers/NextAuthProvider";
import { ThemeProvider } from "@/providers/ThemeProvider";
import { Providers } from "./providers";
import { cn } from "@/lib/utils";

const ubuntu = Ubuntu({
  weight: ['300', '400', '500', '700'],
  subsets: ["latin"],
  variable: "--font-ubuntu",
});

export const metadata: Metadata = {
  title: "Revolis - Logiciel de gestion",
  description: "Application de gestion intégrée pour les entreprises",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body
        className={cn(
          "min-h-screen bg-background font-sans antialiased",
          ubuntu.variable
        )}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

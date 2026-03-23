import type { Metadata } from "next";
import { Geist, Caveat } from "next/font/google";
import { SessionProvider } from "@/app/components/SessionProvider";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Diagramatix",
  description: "Professional process diagramming for business analysts",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geist.variable} ${caveat.variable} antialiased`}>
          <SessionProvider>{children}</SessionProvider>
        </body>
    </html>
  );
}

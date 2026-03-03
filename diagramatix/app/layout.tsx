import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { SessionProvider } from "@/app/components/SessionProvider";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist",
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
      <body className={`${geist.variable} antialiased`}>
          <SessionProvider>{children}</SessionProvider>
        </body>
    </html>
  );
}

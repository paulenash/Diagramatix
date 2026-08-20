import type { Metadata } from "next";
import { Geist, Caveat } from "next/font/google";
import { SessionProvider } from "@/app/components/SessionProvider";
import { GlobalOverlays } from "@/app/components/GlobalOverlays";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
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
  metadataBase: new URL("https://app.diagramatix.com.au"),
  title: {
    default: "Diagramatix",
    template: "%s — Diagramatix",
  },
  description: "Professional process diagramming for business analysts",
  openGraph: {
    siteName: "Diagramatix",
    type: "website",
    locale: "en_AU",
    title: "Diagramatix",
    description: "Professional process diagramming for business analysts",
    // No og:image yet — add once a 1200x630 asset exists.
  },
  twitter: {
    card: "summary",
    title: "Diagramatix",
    description: "Professional process diagramming for business analysts",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Screencast Studio is gated on REAL SuperAdmin identity (not the view-aware
  // acting mode), so it stays available while a SuperAdmin films the OrgAdmin /
  // User experience via the dgx_sa_mode switch.
  const screencastEnabled = isSuperuser(await auth());
  return (
    <html lang="en">
      <body className={`${geist.variable} ${caveat.variable} antialiased`}>
          <SessionProvider>
            {children}
            <GlobalOverlays screencastEnabled={screencastEnabled} />
          </SessionProvider>
        </body>
    </html>
  );
}

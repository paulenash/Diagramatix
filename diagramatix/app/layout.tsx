import type { Metadata } from "next";
import { Geist, Caveat } from "next/font/google";
import { SessionProvider } from "@/app/components/SessionProvider";
import { GlobalOverlays } from "@/app/components/GlobalOverlays";
import { ScreenBrightness } from "@/app/components/ScreenBrightness";
import { displayBootScript } from "@/app/lib/ui/screenDisplay";
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
  const superAdmin = isSuperuser(await auth());
  return (
    <html lang="en">
      <head>
        {/* Blocking, and deliberately so: it puts the stored brightness and
            contrast in force BEFORE the first paint. React cannot read
            localStorage until after hydration, which would flash a
            full-brightness screen on every hard reload. */}
        <script dangerouslySetInnerHTML={{ __html: displayBootScript() }} />
      </head>
      <body className={`${geist.variable} ${caveat.variable} antialiased`}>
          <SessionProvider>
            {children}
            <GlobalOverlays superAdmin={superAdmin} />
            {/* Above everything, so the dimmer covers the whole window. */}
            <ScreenBrightness />
          </SessionProvider>
        </body>
    </html>
  );
}

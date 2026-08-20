import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Diagramatix — Account",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col dgx-dashboard-bg">
      <header className="flex justify-center pt-10">
        <Link href="/" className="hover:opacity-80 transition-opacity">
          {/* Wordmark (public/logos/diagramatix-logo.svg, 500x120 viewBox);
              explicit width/height preserve the 4.17:1 aspect ratio without CLS. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logos/diagramatix-logo.svg"
            alt="Diagramatix"
            width={150}
            height={36}
          />
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-8">
        {children}
      </main>

      <footer className="pb-6 text-center text-xs text-gray-500">
        <Link href="/terms" className="hover:underline">
          Terms
        </Link>
        <span className="mx-2" aria-hidden="true">
          ·
        </span>
        <Link href="/privacy" className="hover:underline">
          Privacy
        </Link>
      </footer>
    </div>
  );
}

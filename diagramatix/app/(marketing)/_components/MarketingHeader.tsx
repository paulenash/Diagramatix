"use client";

import { useState } from "react";
import Link from "next/link";

const NAV_LINKS = [
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/about", label: "About" },
];

// Client component: the mobile hamburger needs local open/closed state.
// Signed-in state is resolved server-side in the marketing layout and
// passed down, so no session fetching happens here.
export function MarketingHeader({ signedIn }: { signedIn: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center group">
          {/* Wordmark (public/logos/diagramatix-logo.svg, 500x120 viewBox).
              Explicit width/height reserve layout space (no CLS); h-8 w-auto
              keeps it in the 14h-tall header preserving the 4.17:1 ratio. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logos/diagramatix-logo.svg"
            alt="Diagramatix"
            width={500}
            height={120}
            className="h-8 w-auto group-hover:opacity-80 transition-opacity"
          />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1 text-sm">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="px-3 py-1.5 text-gray-600 hover:text-gray-900 rounded-md hover:bg-gray-50"
            >
              {l.label}
            </Link>
          ))}
          {signedIn ? (
            <Link
              href="/dashboard"
              className="ml-2 px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
            >
              Dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="ml-1 px-3 py-1.5 text-gray-700 hover:text-gray-900 rounded-md hover:bg-gray-50"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="ml-1 px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
              >
                Sign up
              </Link>
            </>
          )}
        </nav>

        {/* Mobile hamburger */}
        <button
          type="button"
          className="md:hidden p-2 -mr-2 text-gray-600 hover:text-gray-900 rounded-md hover:bg-gray-50"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="marketing-mobile-nav"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? (
            <svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
              <line x1={5} y1={5} x2={15} y2={15} />
              <line x1={15} y1={5} x2={5} y2={15} />
            </svg>
          ) : (
            <svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
              <line x1={3} y1={5.5} x2={17} y2={5.5} />
              <line x1={3} y1={10} x2={17} y2={10} />
              <line x1={3} y1={14.5} x2={17} y2={14.5} />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile nav panel */}
      {menuOpen && (
        <nav
          id="marketing-mobile-nav"
          className="md:hidden border-t border-gray-200 bg-white px-6 py-3 flex flex-col gap-1 text-sm"
        >
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="px-3 py-2 text-gray-600 hover:text-gray-900 rounded-md hover:bg-gray-50"
              onClick={() => setMenuOpen(false)}
            >
              {l.label}
            </Link>
          ))}
          <div className="mt-2 pt-2 border-t border-gray-100 flex flex-col gap-1">
            {signedIn ? (
              <Link
                href="/dashboard"
                className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium text-center"
                onClick={() => setMenuOpen(false)}
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="px-3 py-2 text-gray-700 hover:text-gray-900 rounded-md hover:bg-gray-50"
                  onClick={() => setMenuOpen(false)}
                >
                  Sign in
                </Link>
                <Link
                  href="/register"
                  className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium text-center"
                  onClick={() => setMenuOpen(false)}
                >
                  Sign up
                </Link>
              </>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}

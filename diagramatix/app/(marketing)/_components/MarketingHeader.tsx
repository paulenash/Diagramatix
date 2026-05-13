import Link from "next/link";

export function MarketingHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <span className="text-base font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
            Diagramatix
          </span>
        </Link>

        <nav className="flex items-center gap-1 text-sm">
          <Link
            href="/pricing"
            className="px-3 py-1.5 text-gray-600 hover:text-gray-900 rounded-md hover:bg-gray-50"
          >
            Pricing
          </Link>
          <Link
            href="/about"
            className="px-3 py-1.5 text-gray-600 hover:text-gray-900 rounded-md hover:bg-gray-50"
          >
            About
          </Link>
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
      </div>
    </header>
  );
}

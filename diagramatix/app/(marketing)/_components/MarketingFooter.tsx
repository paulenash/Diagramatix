import Link from "next/link";

export function MarketingFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-gray-200 bg-white mt-auto">
      <div className="max-w-6xl mx-auto px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-gray-500">
        <span>© {year} Diagramatix</span>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link href="/about" className="hover:text-gray-900">About</Link>
          <Link href="/terms" className="hover:text-gray-900">Terms</Link>
          <Link href="/privacy" className="hover:text-gray-900">Privacy</Link>
          <a href="mailto:sales@diagramatix.com.au" className="hover:text-gray-900">
            Contact
          </a>
          <a
            href="https://www.diagramatix.com.au"
            className="hover:text-gray-900"
          >
            diagramatix.com.au
          </a>
        </div>
      </div>
    </footer>
  );
}

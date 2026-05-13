import Link from "next/link";

export function MarketingFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-gray-200 bg-white mt-auto">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between text-xs text-gray-500">
        <span>© {year} Diagramatix</span>
        <div className="flex items-center gap-4">
          <Link href="/terms" className="hover:text-gray-900">Terms</Link>
          <Link href="/privacy" className="hover:text-gray-900">Privacy</Link>
        </div>
      </div>
    </footer>
  );
}

import Link from "next/link";
import { auth } from "@/auth";
import { MarketingHeader } from "./(marketing)/_components/MarketingHeader";
import { MarketingFooter } from "./(marketing)/_components/MarketingFooter";

// Branded 404 — lives outside the (marketing) route group, so it renders the
// marketing chrome itself to match the public pages.
export default async function NotFound() {
  const session = await auth();
  const signedIn = !!session?.user;

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <MarketingHeader signedIn={signedIn} />
      <main className="flex-1 flex items-center">
        <div className="max-w-2xl mx-auto px-6 py-24 text-center">
          <p className="text-xs uppercase tracking-widest text-blue-600 font-medium mb-4">
            404
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">
            Page not found
          </h1>
          <p className="mt-4 text-sm text-gray-600">
            The page you&apos;re looking for doesn&apos;t exist or has moved.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3 text-sm font-medium">
            <Link
              href="/"
              className="px-5 py-2.5 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Go home
            </Link>
            <Link
              href="/pricing"
              className="px-5 py-2.5 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Pricing
            </Link>
            <Link
              href="/login"
              className="px-5 py-2.5 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Sign in
            </Link>
          </div>
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}

import { auth } from "@/auth";
import { MarketingHeader } from "./_components/MarketingHeader";
import { MarketingFooter } from "./_components/MarketingFooter";

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const signedIn = !!session?.user;

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <MarketingHeader signedIn={signedIn} />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}

import { cookies } from "next/headers";
import { actAsLevelFromMode, SA_MODE_COOKIE } from "@/app/lib/features/actAs";

/**
 * A slim pill that says a SuperAdmin is ACTING AS a customer level — because then the server
 * enforces that level's features and limits (features/actAs.ts) and a "not available" or a
 * limit-reached is real, not a fault. Only ever drawn for a real SuperAdmin.
 */
export async function ActingAsBanner({ superAdmin }: { superAdmin: boolean }) {
  if (!superAdmin) return null;
  const level = actAsLevelFromMode((await cookies()).get(SA_MODE_COOKIE)?.value);
  if (!level) return null;
  const name = level.charAt(0).toUpperCase() + level.slice(1);
  return (
    <div
      role="status"
      aria-label="Acting as a subscription level"
      className="fixed top-1 left-1/2 -translate-x-1/2 z-[60] rounded-full bg-amber-500 text-white text-[11px] font-medium px-3 py-1 shadow pointer-events-none"
    >
      Acting as {name} — its features and limits are enforced
    </div>
  );
}

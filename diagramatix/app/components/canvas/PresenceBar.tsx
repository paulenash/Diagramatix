/**
 * Co-authoring presence bar — a stack of initials chips for everyone currently
 * in this diagram. Renders nothing unless at least one OTHER person is present.
 */
import type { PresenceMember } from "@/app/hooks/usePresence";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function PresenceBar({ members }: { members: PresenceMember[] }) {
  // Only surface when someone else is here (self alone → hide).
  if (members.filter((m) => !m.isSelf).length === 0) return null;
  // Self first, then others, capped for space.
  const ordered = [...members].sort((a, b) => (a.isSelf === b.isSelf ? 0 : a.isSelf ? -1 : 1));
  const shown = ordered.slice(0, 6);
  const overflow = ordered.length - shown.length;
  return (
    <div className="flex items-center gap-2" title="People in this diagram">
      <div className="flex items-center -space-x-1.5">
        {shown.map((m) => (
          <div
            key={m.userId}
            title={`${m.userName}${m.isSelf ? " (you)" : ""}${m.editingElementIds.length ? " — editing" : ""}`}
            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white ring-2 ring-white shadow-sm select-none"
            style={{ backgroundColor: m.color }}
          >
            {initials(m.userName)}
          </div>
        ))}
        {overflow > 0 && (
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-gray-700 bg-gray-200 ring-2 ring-white">
            +{overflow}
          </div>
        )}
      </div>
    </div>
  );
}

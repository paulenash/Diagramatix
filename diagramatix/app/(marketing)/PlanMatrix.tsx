import type { PublicMatrix } from "@/app/lib/features/publicMatrix";

/**
 * "Every feature, by plan": a comparison table built from the live Feature
 * Availability matrix (app/lib/features/publicMatrix.ts). A server component —
 * no JavaScript needed, and each request reads the current matrix.
 */
export function PlanMatrix({ matrix, caption }: { matrix: PublicMatrix; caption: string }) {
  if (matrix.levels.length === 0 || matrix.groups.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full text-sm" aria-label={caption}>
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-gray-50">
          <tr>
            <th scope="col" className="text-left font-medium text-gray-600 px-4 py-3">Feature</th>
            {matrix.levels.map((l) => (
              <th key={l.id} scope="col" className="font-semibold text-gray-800 px-3 py-3 text-center whitespace-nowrap">{l.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.groups.map((g) => (
            <GroupRows key={g.category} group={g} levels={matrix.levels} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GroupRows({ group, levels }: { group: PublicMatrix["groups"][number]; levels: PublicMatrix["levels"] }) {
  return (
    <>
      <tr className="bg-gray-100">
        <th colSpan={levels.length + 1} scope="colgroup" className="text-left px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{group.category}</th>
      </tr>
      {group.rows.map((r) => (
        <tr key={r.key} className="border-t border-gray-100">
          <th scope="row" className="text-left font-normal text-gray-800 px-4 py-2">{r.label}</th>
          {levels.map((l) => {
            const c = r.cells[l.id];
            return (
              <td key={l.id} className="text-center px-3 py-2">
                {c === "included" && <span className="text-blue-600 font-semibold" aria-label="Included">✓</span>}
                {c === "soon" && <span className="text-amber-600 text-xs" aria-label="Coming soon" title="Visible on this plan, not yet usable">soon</span>}
                {c === "no" && <span className="text-gray-300" aria-label="Not included">—</span>}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}

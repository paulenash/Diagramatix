"use client";
import Link from "next/link";
import { COMMAND_CATALOG, SUPERADMIN_COMMAND_CATALOG, type CatalogFamily } from "@/app/lib/assist/commandCatalog";


/** One family as a table. Shared so the two catalogues cannot drift apart. */
function CommandFamily({ fam }: { fam: CatalogFamily }) {
  return (
    <section className="mb-6">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-purple-700 mb-2">{fam.family}</h2>
      <table className="w-full text-sm border border-gray-200 rounded">
        <thead className="bg-gray-50 text-xs text-gray-500">
          <tr><th className="text-left px-3 py-1.5 w-1/3">Does</th><th className="text-left px-3 py-1.5">Say (any of)</th></tr>
        </thead>
        <tbody>
          {fam.items.map((item) => (
            <tr key={item.does} className="border-t border-gray-100 align-top">
              <td className="px-3 py-1.5 text-gray-800">{item.does}{item.voice && <span className="ml-1 text-[10px] text-gray-400">(mic word)</span>}</td>
              <td className="px-3 py-1.5 text-gray-600 italic">{item.say.map((s) => `“${s}”`).join(" · ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** Read-only catalogue of Abracadabra commands (SuperAdmin tile). */
export function AbracadabraCommandsClient() {
  const total = COMMAND_CATALOG.reduce((n, f) => n + f.items.reduce((m, i) => m + i.say.length, 0), 0);
  return (
    <div className="max-w-4xl mx-auto px-6 py-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <Link href="/dashboard/admin" className="text-xs text-gray-500 hover:text-gray-700">← SuperAdmin</Link>
          <h1 className="text-xl font-semibold text-purple-800 mt-1">🪄 Abracadabra Commands</h1>
          <p className="text-sm text-gray-600 mt-1">
            Everything the voice / typed editor accepts, by family — {total} example phrases. Each one is held to the
            grammar by a test, so a phrase listed here is a phrase that works today.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 mb-5">
        <div className="font-semibold mb-1">What is editable, and what is code</div>
        <ul className="list-disc pl-5 space-y-0.5">
          <li>The <strong>phrasings</strong> the instant (free) path accepts are regular expressions in <code>app/lib/assist/commandGrammar.ts</code> — code, changed by a release.</li>
          <li>The <strong>AI fallback</strong> also reads the green <em>Command Aliases &amp; Phrasing</em> rules of the <em>assist</em> category in the Diagram Rules editor — editable, but they only steer the AI, never the instant path.</li>
          <li><Link href="/dashboard/admin/intent-keywords" className="underline">Assist / NL Rules</Link> is the separate, editable catalogue for the 👻 ghost suggestions (element-name keywords → template / data object).</li>
          <li>An admin-editable <strong>alias table</strong> consulted before the grammar (spoken phrase → canonical command) is planned; until then, a new phrasing is a code change.</li>
        </ul>
      </div>

      {COMMAND_CATALOG.map((fam) => <CommandFamily key={fam.family} fam={fam} />)}

      {/* Commands that work but are deliberately kept off the card behind the
          bar's "Commands" button (Paul, 2026-09-17). The card is what someone
          reads while trying to get work done; a presentation flourish does not
          earn a line on it. It still has to be written down somewhere, and this
          is that somewhere. */}
      <div className="rounded-lg border border-purple-200 bg-purple-50 px-4 py-3 text-sm text-purple-900 mb-4 mt-8">
        <div className="font-semibold mb-1">Not shown to users</div>
        <p>
          These work exactly like any other command, but are left off the “What you can say” card in the editor so it
          stays about doing the work. They are listed here instead.
        </p>
      </div>
      {SUPERADMIN_COMMAND_CATALOG.map((fam) => <CommandFamily key={fam.family} fam={fam} />)}

      <p className="text-xs text-gray-500">Reference document: <code>docs/abracadabra-commands.md</code>. Selection references (this / these / the selected …) and confirmations are described there too.</p>
    </div>
  );
}

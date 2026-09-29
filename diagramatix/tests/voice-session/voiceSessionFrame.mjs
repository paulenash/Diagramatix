/**
 * Stage 4 of mobile voice (2026-09-29): the desktop's Voice Assist session
 * block — DiagramEditor.tsx, from the "Voice Assist: live voice/typed command
 * editing" marker to the unmount effect — becomes a hook,
 * app/hooks/useVoiceSession.ts, UNEDITED.
 *
 * This module is the one recipe for that hook, used twice:
 *   • before the move, the behaviour tests (tests/voice-session/*) run the
 *     block cut out of TODAY's editor, wrapped by buildHookSource();
 *   • the move itself writes app/hooks/useVoiceSession.ts with the same
 *     buildHookSource() — so the text the tests ran is the text that ships.
 *
 * It reads the editor with the TypeScript compiler (no type-checking, just the
 * syntax tree and scopes): what the block uses from the component (the hook's
 * host), from imports and from module scope, and which of the block's own
 * names the rest of the editor uses (what the hook returns).
 *
 * Plain JS (.mjs) so a vitest test and a node script can both load it.
 */
import ts from "typescript";

export const BLOCK_START = "  // ── Voice Assist: live voice/typed command editing ──";
export const BLOCK_END = "  useEffect(() => () => { voiceDictRef.current?.stop(); }, []);";

/** The host's editor values that are not useDiagram edit actions — typed by hand (the rest come from AssistDiagramActions). */
export const HOST_VALUE_TYPES = {
  data: "DiagramData",
  diagramId: "string",
  diagramName: "string",
  diagramType: "DiagramType",
  diagramColorConfig: "SymbolColorConfig",
  displayMode: "DisplayMode",
  riskCatalog: "AssistApplyContext[\"riskCatalog\"]",
  elementsRef: "MutableRefObject<DiagramElement[]>",
  connectorsRef: "MutableRefObject<Connector[]>",
  selectedIdsRef: "MutableRefObject<string[]>",
  selectedConnectorIdRef: "MutableRefObject<string | null>",
  nextStepRef: "AssistApplyContext[\"refs\"][\"nextStepRef\"]",
  openTemplateWindowRef: "AssistApplyContext[\"refs\"][\"openTemplateWindowRef\"]",
  setSelectedElementIds: "Dispatch<SetStateAction<Set<string>>>",
  setSelectedConnectorId: "Dispatch<SetStateAction<string | null>>",
  beginLabelEdit: "(id: string) => void",
  cancelLabelEdit: "() => void",
  beginHistoryGroup: "() => void",
  endHistoryGroup: "() => void",
  handleExportJson: "() => void | Promise<void>",
};

/** The block's own state the tests (and Stage 5/6 screens) read, beyond what the editor uses. */
export const EXTRA_RETURNS = ["renameFlow", "messageFlow", "pickFlow", "dividerFlow", "pendingConfirmRef", "voiceQueueRef", "voiceBusyRef"];

const norm = (t) => t.replace(/\r\n/g, "\n");

/** The editor split around the block (line-exact, LF). */
export function sliceBlock(editorText) {
  const lines = norm(editorText).split("\n");
  const s = lines.findIndex((l) => l === BLOCK_START);
  const e = lines.findIndex((l) => l === BLOCK_END);
  if (s < 0 || e < 0 || e < s) throw new Error(`voice block markers not found (start ${s}, end ${e})`);
  if (lines.filter((l) => l === BLOCK_START).length !== 1 || lines.filter((l) => l === BLOCK_END).length !== 1) {
    throw new Error("voice block markers must each appear exactly once");
  }
  return {
    before: lines.slice(0, s).join("\n"),
    block: lines.slice(s, e + 1).join("\n"),
    after: lines.slice(e + 1).join("\n"),
    startLine: s + 1,
    endLine: e + 1,
  };
}

/** What the block uses and what the editor uses from it. */
export function analyse(editorText) {
  const text = norm(editorText);
  const { startLine, endLine } = sliceBlock(text);
  const lines = text.split("\n");
  const off = (ln) => lines.slice(0, ln).reduce((a, l) => a + l.length + 1, 0);
  const S = off(startLine - 1), E = off(endLine);
  const file = "DiagramEditor.tsx";
  const host = ts.createCompilerHost({ jsx: ts.JsxEmit.Preserve, noResolve: true, noLib: true, target: ts.ScriptTarget.ES2022 });
  const orig = host.getSourceFile;
  host.getSourceFile = (name, lang) => (name === file ? ts.createSourceFile(file, text, lang, true, ts.ScriptKind.TSX) : orig.call(host, name, lang));
  host.fileExists = (n) => n === file;
  host.readFile = (n) => (n === file ? text : undefined);
  const prog = ts.createProgram([file], { jsx: ts.JsxEmit.Preserve, noResolve: true, noLib: true, target: ts.ScriptTarget.ES2022 }, host);
  const sf = prog.getSourceFile(file);
  const ch = prog.getTypeChecker();

  const hostFields = new Set();        // component-scope names the block reads
  const moduleNames = new Set();       // module-scope declarations the block (or they) read
  const importUses = new Map();        // import name → { spec, typeOnly, kind }
  const blockDecls = new Map();        // block top-level declaration name → decl node

  // the component body: the function whose body holds the block
  let comp = null;
  (function find(n) {
    if ((ts.isFunctionDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n)) && n.body && n.body.pos <= S && n.body.end >= E) comp = n;
    ts.forEachChild(n, find);
  })(sf);
  if (!comp || !ts.isBlock(comp.body)) throw new Error("component body not found");
  for (const st of comp.body.statements) {
    if (st.getStart(sf) < S || st.end > E) continue;
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        const names = [];
        const collect = (b) => { if (ts.isIdentifier(b)) names.push(b.text); else for (const el of b.elements) if (!ts.isOmittedExpression(el)) collect(el.name); };
        collect(d.name);
        for (const n of names) blockDecls.set(n, d);
      }
    } else if (ts.isFunctionDeclaration(st) && st.name) blockDecls.set(st.name.text, st);
  }

  const isPropName = (n) => {
    const p = n.parent;
    return (ts.isPropertyAccessExpression(p) && p.name === n)
      || (ts.isPropertyAssignment(p) && p.name === n)
      || (ts.isPropertySignature(p) && p.name === n)
      || (ts.isQualifiedName(p) && p.right === n)
      || (ts.isBindingElement(p) && p.propertyName === n);
  };
  const declsOf = (n) => {
    const p = n.parent;
    if (p && ts.isShorthandPropertyAssignment(p) && p.name === n) {
      const s2 = ch.getShorthandAssignmentValueSymbol(p);
      return (s2 && s2.declarations) || [];
    }
    const sym = ch.getSymbolAtLocation(n);
    return (sym && sym.declarations) || [];
  };
  const inside = (d, a, b) => { const p = d.getStart(sf); return p >= a && p < b; };
  const isImportDecl = (d) => ts.isImportSpecifier(d) || ts.isImportClause(d) || ts.isNamespaceImport(d);
  const importInfo = (d) => {
    let decl = d; while (decl && !ts.isImportDeclaration(decl)) decl = decl.parent;
    const spec = decl.moduleSpecifier.text;
    const clauseTypeOnly = !!decl.importClause?.isTypeOnly;
    if (ts.isImportSpecifier(d)) return { spec, typeOnly: clauseTypeOnly || d.isTypeOnly, kind: "named", imported: (d.propertyName || d.name).text };
    if (ts.isNamespaceImport(d)) return { spec, typeOnly: clauseTypeOnly, kind: "namespace" };
    return { spec, typeOnly: clauseTypeOnly, kind: "default" };
  };
  const moduleDeclNode = (d) => { let k = d; while (k && k.parent !== sf) k = k.parent; return k; };

  const pendingModule = [];
  const scan = (root, a, b, isBlock) => {
    (function visit(n) {
      if (n.end <= a || n.pos >= b) return;
      if (ts.isIdentifier(n) && n.getStart(sf) >= a && n.end <= b && !isPropName(n)) {
        for (const d of declsOf(n)) {
          if (d.getSourceFile() !== sf) continue;
          if (isBlock && inside(d, S, E)) continue;
          if (!isBlock && inside(d, a, b)) continue;
          if (isImportDecl(d)) { importUses.set(n.text, importInfo(d)); continue; }
          const top = moduleDeclNode(d);
          if (top && top !== comp && !(top.pos <= comp.pos && top.end >= comp.end)) {
            // module scope (outside the component)
            if (!moduleNames.has(n.text)) { moduleNames.add(n.text); pendingModule.push(top); }
            continue;
          }
          if (isBlock && d.getStart(sf) > comp.getStart(sf) && d.end <= comp.end) hostFields.add(n.text);
        }
      }
      ts.forEachChild(n, visit);
    })(root);
  };
  scan(sf, S, E, true);
  const moduleDeclTexts = [];
  const seenTop = new Set();
  while (pendingModule.length) {
    const top = pendingModule.shift();
    if (seenTop.has(top)) continue;
    seenTop.add(top);
    moduleDeclTexts.push({ pos: top.getStart(sf), text: text.slice(top.getFullStart(), top.end).replace(/^\n+/, "") });
    scan(top, top.getStart(sf), top.end, false);
  }
  moduleDeclTexts.sort((x, y) => x.pos - y.pos);

  // what the rest of the editor uses from the block
  const returns = new Set();
  (function visit(n) {
    if (ts.isIdentifier(n) && !isPropName(n) && (n.getStart(sf) >= E || n.end <= S) && n.getStart(sf) > comp.getStart(sf) && n.end <= comp.end) {
      for (const d of declsOf(n)) {
        if (d.getSourceFile() === sf && inside(d, S, E) && blockDecls.has(n.text)) returns.add(n.text);
      }
    }
    ts.forEachChild(n, visit);
  })(sf);

  return {
    hostFields: [...hostFields].sort(),
    returnNames: [...returns].sort(),
    extraReturns: EXTRA_RETURNS.filter((n) => blockDecls.has(n) && !returns.has(n)),
    imports: importUses,
    moduleDecls: moduleDeclTexts.map((m) => m.text),
    blockLines: [startLine, endLine],
  };
}

function importLines(imports, extraTypes) {
  const bySpec = new Map();
  const add = (spec, entry) => { if (!bySpec.has(spec)) bySpec.set(spec, { named: new Map(), def: null, ns: null }); const g = bySpec.get(spec); if (entry.kind === "named") g.named.set(entry.local, entry); else if (entry.kind === "default") g.def = entry; else g.ns = entry; };
  for (const [local, info] of imports) add(info.spec, { ...info, local });
  for (const [spec, names] of Object.entries(extraTypes)) for (const n of names) if (![...bySpec.get(spec)?.named.keys() ?? []].includes(n)) add(spec, { spec, typeOnly: true, kind: "named", imported: n, local: n });
  const out = [];
  for (const [spec, g] of [...bySpec].sort((a, b) => a[0].localeCompare(b[0]))) {
    const named = [...g.named.values()].sort((a, b) => a.local.localeCompare(b.local));
    const allTypes = named.length > 0 && named.every((x) => x.typeOnly) && !g.def && !g.ns;
    const spec1 = (x) => `${!allTypes && x.typeOnly ? "type " : ""}${x.imported === x.local ? x.local : `${x.imported} as ${x.local}`}`;
    if (g.ns) out.push(`import ${g.ns.typeOnly ? "type " : ""}* as ${g.ns.local} from "${spec}";`);
    if (g.def && !named.length) out.push(`import ${g.def.typeOnly ? "type " : ""}${g.def.local} from "${spec}";`);
    if (named.length) {
      const head = g.def ? `${g.def.local}, ` : "";
      out.push(`import ${allTypes ? "type " : ""}${head}{ ${named.map(spec1).join(", ")} } from "${spec}";`);
    }
  }
  return out.join("\n");
}

/**
 * The hook's source: the block, UNEDITED, inside `useVoiceSession(host)`, which
 * first unpacks the host into the block's own names and last returns what the
 * editor uses. `opts.moduleTypesFrom`: import the module-scope types from there
 * instead of copying them (once they have a module of their own).
 */
export function buildHookSource(editorText, opts = {}) {
  const text = norm(editorText);
  const a = analyse(text);
  const { block } = sliceBlock(text);
  const actionNames = a.hostFields.filter((n) => !(n in HOST_VALUE_TYPES));
  const valueNames = a.hostFields.filter((n) => n in HOST_VALUE_TYPES);
  const missing = Object.keys(HOST_VALUE_TYPES).filter((n) => !a.hostFields.includes(n));
  if (missing.length) throw new Error(`host value types listed but not used by the block: ${missing.join(", ")}`);
  const extraTypes = {
    react: ["Dispatch", "SetStateAction", "MutableRefObject"],
    "@/app/lib/assist/applyAssistOps": ["AssistDiagramActions", "AssistApplyContext"],
    "@/app/lib/diagram/types": ["DiagramData", "DiagramType", "DiagramElement", "Connector"],
    "@/app/lib/diagram/displayMode": ["DisplayMode"],
    "@/app/lib/diagram/colors": ["SymbolColorConfig"],
  };
  const moduleTypeNames = a.moduleDecls.length ? [...new Set(a.moduleDecls.map((t) => (t.match(/^(?:export\s+)?(?:type|interface)\s+([A-Za-z0-9_]+)/) || [])[1]).filter(Boolean))] : [];
  if (opts.moduleTypesFrom && moduleTypeNames.length) extraTypes[opts.moduleTypesFrom] = moduleTypeNames;
  const imports = importLines(a.imports, extraTypes);
  const moduleDecls = opts.moduleTypesFrom ? "" : a.moduleDecls.join("\n\n") + "\n\n";
  const returns = [...a.returnNames, ...a.extraReturns];

  return `"use client";

/**
 * The Voice Assist session — moved UNEDITED out of DiagramEditor.tsx (Stage 4
 * of mobile voice, 2026-09-29) so the desktop editor and the phone can share it.
 * Generated by tests/voice-session/voiceSessionFrame.mjs (buildHookSource) from
 * the editor's block; the behaviour tests in tests/voice-session/ ran this text.
 *
 * RULES (the reasons many earlier bugs were fixed):
 *   • Call it exactly where the block was — after the editor's own hooks that
 *     it reads, before those that read it: its 11 effects keep their order
 *     among the editor's (gold flash → touched → settle → drain …).
 *   • One apply → exactly one log line, in the same tick (appliedOpsRef).
 *   • Refs re-assigned during render (runAbraCommandRef …) are how the mic's
 *     callbacks, made once per toggle, reach the latest code.
 *   • Mixed freshness is deliberate: the router reads the render's \`data\`,
 *     the flows read elementsRef.
 */
${imports}

${moduleDecls}/** What the host screen supplies: its useDiagram edit actions and its editor values. */
export interface VoiceSessionHost extends Pick<AssistDiagramActions, ${actionNames.map((n) => JSON.stringify(n)).join(" | ")}> {
${valueNames.map((n) => `  ${n}: ${HOST_VALUE_TYPES[n]};`).join("\n")}
}

export function useVoiceSession(host: VoiceSessionHost) {
  const {
    ${a.hostFields.join(", ")},
  } = host;

${block}

  return {
    ${returns.join(", ")},
  };
}
`;
}

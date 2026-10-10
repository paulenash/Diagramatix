import { gateLimit, recordUsage } from "@/app/lib/subscription-route";
import { isQuotaExhausted, quotaResumesAt } from "@/app/lib/ai/quotaExhausted";
import { MD_PROMPT_LABEL, type MdPromptType } from "./promptTemplates";
import { answersBlock, wantsEntityNames } from "./promptQuestions";
import { loadEntityNames } from "./entityNames";
import { generateAndStorePrompt, loadPromptBriefing } from "./storePrompt";
import { publishChainById } from "./publishChain";
import { missingTargets } from "./newChain";
import type { PromptTarget } from "./generatePrompt";

/**
 * Write the prompts of a user-created chain, streaming progress as NDJSON — one JSON object per line, the same shape the maintenance screen
 * reads:
 *   { t:"chain",  chainId, code, title, total, ... }                   first line (the caller supplies it)
 *   { t:"prompt", index, total, name, type, status:"generating" }
 *   { t:"prompt", ..., status:"done", chars, ms, roundTrips }  |  status:"error"|"refused", message
 *   { t:"halted", reason:"limit"|"quota", message, written, remaining }
 *   { t:"done",   written, failed, refused, complete, published }
 *
 * Shared by CREATE (every target) and RESUME (only those still missing), so a stopped run and a fresh one behave identically.
 *
 * One AI attempt is charged per prompt WRITTEN (not per try), the allowance is checked before EACH prompt, and a run that reaches its limit
 * stops with what it has written and says so — the chain stays a draft and RESUME carries on from there. A spend cap stops the run too (it is
 * every remaining prompt failing, not this one). The chain is published to the Org only when every planned prompt exists.
 */
export interface ChainRunArgs {
  userId: string;
  orgId: string;
  isSuper: boolean;
  chain: { id: string; code: string; title: string; narrative: string };
  subs: { code: string; title: string }[];
  /** Everything the chain is planned to have, in writing order. */
  allTargets: PromptTarget[];
  /** The part of it to write in this run. */
  targets: PromptTarget[];
  answers: { label: string; answer: string }[];
  model: string;
  apiKey: string;
  /** The first line of the stream. */
  first: Record<string, unknown>;
}

export const targetName = (chain: { code: string; title: string }, t: PromptTarget): string =>
  t.type === "bpmn" ? `${t.code} ${t.title}` : `${chain.code} ${chain.title} — ${MD_PROMPT_LABEL[t.type]}`;

export function streamChainRun(a: ChainRunArgs): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(encoder.encode(JSON.stringify(o) + "\n"));
      send(a.first);
      let written = 0, failed = 0, refused = 0, halted = false;
      try {
        const briefs = new Map<MdPromptType, { briefing: string; additions: string }>();
        for (const t of new Set(a.targets.map((x) => x.type))) briefs.set(t, await loadPromptBriefing(t, a.orgId));
        const answersText = answersBlock(a.answers);
        const entityNames = wantsEntityNames(a.answers) ? await loadEntityNames(a.orgId) : "";

        for (let i = 0; i < a.targets.length; i++) {
          const target = a.targets[i];
          const name = targetName(a.chain, target);
          const total = a.targets.length;
          // The allowance is checked before EACH prompt, so a run that hits its limit stops cleanly with what it has written.
          const blocked = await gateLimit(a.userId, "aiAttempts");
          if (blocked) {
            const j = await blocked.json().catch(() => ({} as { message?: string; error?: string }));
            send({ t: "halted", reason: "limit", message: `${j.message ?? j.error ?? "You have reached your AI attempts limit."} Stopped after ${written} written; ${total - i} not written yet — you can carry on later.`, written, remaining: total - i });
            halted = true;
            break;
          }
          send({ t: "prompt", index: i + 1, total, name, type: target.type, status: "generating" });
          const t0 = Date.now();
          const b = briefs.get(target.type)!;
          const out = await generateAndStorePrompt({
            apiKey: a.apiKey, model: a.model, briefing: b.briefing, additions: b.additions,
            chainId: a.chain.id, chainCode: a.chain.code, chainTitle: a.chain.title, narrative: a.chain.narrative, subs: a.subs, target, name,
            ...(target.type === "bpmn" ? { answers: answersText || undefined, entityNames: entityNames || undefined } : {}),
          });
          if (out.status === "error") {
            failed++;
            send({ t: "prompt", index: i + 1, total, name, type: target.type, status: "error", message: out.message });
            if (isQuotaExhausted(out.message)) {
              const back = quotaResumesAt(out.message);
              send({
                t: "halted", reason: "quota", written, remaining: total - i - 1,
                message: "The AI account has hit its usage limit" + (back ? `, and regains access on ${back}` : "")
                  + `. Stopped after ${written} written; ${total - i - 1} not attempted — you can carry on later.`,
              });
              halted = true;
              break;
            }
            continue;
          }
          if (out.status === "refused") {
            refused++;
            send({ t: "prompt", index: i + 1, total, name, type: target.type, status: "refused", message: out.message });
            continue;
          }
          written++;
          if (!a.isSuper) await recordUsage(a.userId, "aiAttempts");
          send({ t: "prompt", index: i + 1, total, name, type: target.type, status: "done", chars: out.chars, roundTrips: out.roundTrips, ms: Date.now() - t0 });
        }

        // Published to the Org only when EVERY planned prompt exists; otherwise it stays a draft for its managers to finish.
        const stillMissing = await missingTargets(a.chain.id, a.allTargets);
        const complete = stillMissing.length === 0;
        let published = false;
        if (complete && !halted) { await publishChainById(a.chain.id); published = true; }
        send({ t: "done", chainId: a.chain.id, code: a.chain.code, written, failed, refused, complete, published, missing: stillMissing.length });
      } catch (err) {
        send({ t: "error", message: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" },
  });
}


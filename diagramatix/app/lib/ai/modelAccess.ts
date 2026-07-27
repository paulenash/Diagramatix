/**
 * Who may generate with which model. A normal user may pick the currently-set
 * default generate model (`ai.generate.model`) and anything EQUAL OR CHEAPER (down
 * the cost scale); a SuperAdmin acting in SuperAdmin mode may pick from ALL
 * configured models. Enforced BOTH in the picker (via `GET /api/ai/models`) and in
 * the generate/plan routes, so a crafted request can't smuggle a pricier model.
 *
 * "Cost" is the representative per-generation USD figure from pricing.ts
 * (`typicalCost`), so a single comparable number ranks every model. Models with no
 * known price are only offered to SuperAdmin (they can't be cost-compared).
 */
import { allModels, type AiModel } from "./models";
import { pricingFor, typicalCost } from "./pricing";

/** Representative USD cost of one generation with `id`, or null when unpriced. */
export function modelCostUsd(id: string): number | null {
  if (/^ollama[/:]/i.test(id)) return 0; // local Ollama runs on your own hardware — free
  const p = pricingFor(id);
  return p ? typicalCost(p) : null;
}

/** The models a caller may choose from. SA-mode → every configured model. Otherwise
 *  the current default plus every model that is priced and costs ≤ the current
 *  default's cost (a tiny epsilon absorbs float noise). The current model is always
 *  included. */
export function allowedGenerateModels(currentModelId: string, superAdminMode: boolean): AiModel[] {
  const all = allModels();
  if (superAdminMode) return all;

  const ceiling = modelCostUsd(currentModelId);
  const EPS = 1e-9;
  return all.filter((m) => {
    if (m.id === currentModelId) return true; // always keep the current default
    if (ceiling == null) return false; // can't compare against an unpriced default
    const c = modelCostUsd(m.id);
    return c != null && c <= ceiling + EPS;
  });
}

/** Guard for the generate/plan routes: is `id` a model this caller may use? */
export function isModelAllowed(id: string, currentModelId: string, superAdminMode: boolean): boolean {
  return allowedGenerateModels(currentModelId, superAdminMode).some((m) => m.id === id);
}

/** Pick the model a generate/plan route should actually use: the caller's
 *  `requested` model when they're allowed it, otherwise the current default. So a
 *  crafted request naming a pricier model silently falls back rather than 403-ing. */
export function chooseModel(
  requested: string | null | undefined,
  currentModelId: string,
  superAdminAllowed: boolean,
): string {
  if (requested && isModelAllowed(requested, currentModelId, superAdminAllowed)) return requested;
  return currentModelId;
}

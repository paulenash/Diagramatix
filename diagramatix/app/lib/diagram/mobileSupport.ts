/**
 * Which diagram types the mobile viewer (`/m`) supports for view + review.
 * Everything else is shown greyed-out (a project with ONLY unsupported
 * diagrams is disabled entirely). Kept in one place so the project list,
 * diagram list and the viewer agree.
 */
export const MOBILE_SUPPORTED_TYPES: readonly string[] = ["value-chain", "bpmn", "state-machine"];

export function isMobileSupportedType(type: string | null | undefined): boolean {
  return !!type && MOBILE_SUPPORTED_TYPES.includes(type);
}

export const MOBILE_SUPPORTED_LABEL = "Value Chain, BPMN and State Machine diagrams";

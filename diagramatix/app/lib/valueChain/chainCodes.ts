/**
 * Value-chain codes.
 *
 * The master repository's chains are V01, V02 … (the SuperAdmin's). A chain a USER creates with "Create a New Value Chain" is coded C01,
 * C02 … and the numbering is LOCAL to the Org (Paul, 2026-10-10: "coded C01, C02, locally") — two Orgs can both have a C01. The prefixes
 * differ so a user's chain can never collide with, or be mistaken for, a master chain that an Org later adopts.
 *
 * The code was assumed to start with `V` in a few places (the create-chain handler, diagramSource). Everything that reads a chain or
 * process code now goes through this file.
 */
export const MASTER_CHAIN_PREFIX = "V";
export const USER_CHAIN_PREFIX = "C";

/** A chain code: V or C, then two or more digits ("V01", "C12", "C100"). */
export const CHAIN_CODE_RE = /^[VC]\d{2,}$/;
/** A process code: a chain code, a dot, two digits ("V01.03", "C02.11"). */
export const PROCESS_CODE_RE = /^[VC]\d{2,}\.\d{2,}$/;
/** A process code at the start of a diagram name ("C01.03 Check Credit"), captured whole. */
export const PROCESS_CODE_PREFIX_RE = /^([VC]\d{2,}\.\d{2,})(?:\s|$)/;

export const isChainCode = (code: string): boolean => CHAIN_CODE_RE.test(code);
export const isUserChainCode = (code: string): boolean => code.startsWith(USER_CHAIN_PREFIX) && CHAIN_CODE_RE.test(code);

/** "C03" for 3; two digits up to 99, then as many as it takes. */
export const userChainCode = (n: number): string => USER_CHAIN_PREFIX + String(n).padStart(2, "0");

/** The next user-chain code in an Org: one more than the highest C number it has (any other prefix is ignored). */
export function nextUserChainCode(existingCodes: readonly string[]): string {
  let max = 0;
  for (const code of existingCodes) {
    const m = /^C(\d+)$/.exec(code);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return userChainCode(max + 1);
}

/** "C03.07" for chain C03, process 7. */
export const processCodeFor = (chainCode: string, n: number): string => `${chainCode}.${String(n).padStart(2, "0")}`;

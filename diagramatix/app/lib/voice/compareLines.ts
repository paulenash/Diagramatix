/**
 * What the side-by-side comparison has two voices say.
 *
 * Real Diagramatix lines, chosen because each is a place a voice can go wrong —
 * a pleasant voice reading "Hello, welcome" tells you nothing about how it will
 * sound asking a user to pick between two tasks.
 */

export interface CompareLine {
  label: string;
  text: string;
}

export const COMPARE_LINES: readonly CompareLine[] = [
  { label: "A picker question", text: "which Review? say a number, 1 or 2, or cancel" },
  { label: "A refusal with names in it", text: "no room above Underwriters for a lane called Quality Assurance" },
  { label: "A name ending in a digit", text: "rename Task 1 to Review Email" },
  { label: "A code", text: "attach R-012" },
  {
    label: "A Staff Narrative paragraph",
    text:
      "I receive the claim from the customer and check that the policy covers the damage. " +
      "If it does, I pass it to the assessor; if it does not, I write to the customer to explain why.",
  },
];

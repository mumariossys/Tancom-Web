import { randomBytes } from "crypto";

export function generateMeetingCode(): string {
  const bytes = randomBytes(6);
  const hex = bytes.toString("hex").toUpperCase();
  return `${hex.slice(0, 3)}-${hex.slice(3, 6)}-${hex.slice(6, 9)}`;
}

// Normalise a user-typed or client-sent meeting code: uppercase, strip spaces
// AND dashes, then reformat as "XXX-XXX-XXX". Accepts any typing style:
// "29D-50D-64F", "29D50D64F", "29D 50D 64F". Shared by every route that looks
// up a meeting by code so all entry points agree on the canonical format.
export function normalizeMeetingCode(input: string): string {
  const stripped = input.trim().toUpperCase().replace(/[\s-]/g, "");
  return stripped.length === 9
    ? `${stripped.slice(0, 3)}-${stripped.slice(3, 6)}-${stripped.slice(6, 9)}`
    : stripped;
}

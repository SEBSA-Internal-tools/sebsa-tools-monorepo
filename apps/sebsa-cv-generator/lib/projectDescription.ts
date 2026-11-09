/** Converts the newline-delimited project description stored in `brief` into CV bullet points. */
export function splitProjectDescription(description: string): string[] {
  return description
    .split(/\r?\n/)
    .map((point) => point.trim().replace(/^(?:[-*•]|\d+[.)])\s*/, ''))
    .filter(Boolean);
}

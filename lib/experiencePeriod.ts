/**
 * Reduces an experience period to the year-only form used by customized CVs.
 * The employee profile keeps its original, precise period unchanged.
 */
export function formatExperiencePeriodAsYears(period: string): string {
  const value = period.trim();
  if (!value) return '';

  const years = value.match(/\b(?:19\d{2}|20\d{2}|2100)\b/g) ?? [];
  const startYear = years[0];
  if (!startYear) return value;

  if (/present|current|now/i.test(value)) return `${startYear} – Present`;

  const endYear = years.at(-1);
  return endYear && endYear !== startYear ? `${startYear} – ${endYear}` : startYear;
}

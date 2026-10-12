/**
 * Formats a job title while preserving established acronyms and mixed-case product names
 * (for example, "SQL Developer" and "iOS Engineer").
 */
export function toTitleCase(value: string): string {
  return value.replace(/[A-Za-z]+(?:['’][A-Za-z]+)*/g, (word) => {
    if (word === word.toUpperCase() || /[A-Z]/.test(word.slice(1))) return word;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
}

/** Designations/current positions are displayed and persisted in uppercase. */
export function toUpperCaseText(value: string): string {
  return value.toUpperCase();
}

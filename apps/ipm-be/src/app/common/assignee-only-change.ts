/**
 * True when an update body changes nothing but the assignee list.
 *
 * The detail pages post every field on Save, so "assignee only" cannot be
 * judged by which keys are present: values identical to what is stored count
 * as untouched. Dates arrive as `YYYY-MM-DD` while the column holds a full
 * timestamp, so those compare by calendar day.
 */
export function changesOnlyAssignees(
  dto: object,
  existing: Record<string, unknown>,
): boolean {
  const body = dto as Record<string, unknown>;
  if (body['assigneeIds'] === undefined) return false;

  for (const [key, value] of Object.entries(body)) {
    if (key === 'assigneeIds' || value === undefined) continue;
    if (!sameValue(value, existing[key])) return false;
  }
  return true;
}

function sameValue(incoming: unknown, stored: unknown): boolean {
  const empty = (v: unknown) => v === null || v === undefined || v === '';
  if (empty(incoming) && empty(stored)) return true;
  if (empty(incoming) || empty(stored)) return false;
  if (stored instanceof Date && typeof incoming === 'string') {
    return stored.toISOString().slice(0, 10) === incoming.slice(0, 10);
  }
  return incoming === stored;
}

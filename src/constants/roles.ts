import type { Role } from "@sdp/types";

/**
 * Role display labels and their canonical order.
 */

export const ROLE_ORDER: readonly Role[] = ["developer", "reviewer", "admin"];

export const ROLE_LABELS: Record<Role, string> = {
  developer: "Developer",
  reviewer: "Reviewer",
  admin: "Admin",
};

export function roleLabel(role: Role): string {
  return ROLE_LABELS[role];
}

/** The user's roles as labels, in canonical order. */
export function orderedRoleLabels(roles: readonly Role[]): string[] {
  return ROLE_ORDER.filter((role) => roles.includes(role)).map(roleLabel);
}

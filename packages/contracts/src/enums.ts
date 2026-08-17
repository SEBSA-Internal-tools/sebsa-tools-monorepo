import { z } from "zod";

/**
 * Closed sets shared across the Code Review Portal.
 *
 * `erasableSyntaxOnly` is enabled repo-wide, so TypeScript `enum` is unavailable
 * by design. Each set is declared once as a frozen tuple, from which both the Zod
 * schema and the union type are derived — add a member in exactly one place.
 */


export const ROLES = ["developer", "reviewer", "admin"] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;


/** Portals registered in the Service Delivery Portal shell. */
export const PORTAL_IDS = ["code-review", "delivery", "wiki"] as const;
export const portalIdSchema = z.enum(PORTAL_IDS);
export type PortalId = z.infer<typeof portalIdSchema>;
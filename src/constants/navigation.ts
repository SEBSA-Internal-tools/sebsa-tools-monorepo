import type { Role } from "@sdp/types";
import type { RoleGradient } from "@/components/ui";
import { content } from "@/content";
import { routePaths } from "./routePaths";

/**
 * The three workspace cards on the portal home page.
 */

export interface WorkspaceCard {
  readonly id: "developer" | "reviewer" | "admin";
  readonly title: string;
  readonly description: string;
  /** Lucide icon name. */
  readonly icon: string;
  readonly href: string;
  readonly requiredRoles: readonly Role[];

  /** Which of the design system role gradients paints the tile and top rule. */
  readonly gradient: RoleGradient;
}

export const workspaceCards: readonly WorkspaceCard[] = [
  {
    id: "developer",
    title: content.home.workspaces.developer.title,
    description: content.home.workspaces.developer.description,
    icon: "Code2",
    href: routePaths.crp.developer.dashboard,
    requiredRoles: ["developer", "admin"],
    gradient: "developer",
  },
  {
    id: "reviewer",
    title: content.home.workspaces.reviewer.title,
    description: content.home.workspaces.reviewer.description,
    icon: "ClipboardCheck",
    href: routePaths.crp.reviewer.dashboard,
    requiredRoles: ["reviewer", "admin"],
    gradient: "reviewer",
  },
  {
    id: "admin",
    title: content.home.workspaces.admin.title,
    description: content.home.workspaces.admin.description,
    icon: "ShieldCheck",
    href: routePaths.crp.admin.dashboard,
    requiredRoles: ["admin"],
    gradient: "admin",
  },
];

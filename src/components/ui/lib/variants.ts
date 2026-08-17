/**
 * Shared variant vocabulary.
 *
 * Components define their own `cva()` configs — one god-variant shared by
 * everything is unreadable — but they splice in these fragments so that
 * "focused", "disabled" and each semantic tone look identical wherever they
 * appear. The words also mean the same thing everywhere: `variant` is the
 * component's visual role, `size` its scale, `tone` its semantic colour, and
 * `state` its interaction state.
 */

/** Applied to every interactive element, so focus is never invisible. */
export const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

export const disabledState = "disabled:pointer-events-none disabled:opacity-50";

export const TONES = [
  "neutral",
  "primary",
  "info",
  "success",
  "warning",
  "danger",
  "brand",
] as const;

export type Tone = (typeof TONES)[number];

/**
 * Tinted surface with its matching foreground — the design system's Status
 * pairs. Every combination here is verified at 4.5:1 or better.
 */
export const toneSurface: Record<Tone, string> = {
  neutral: "bg-neutral-bg text-neutral-fg border-border",
  primary: "bg-purple-bg text-purple-fg border-purple-bg",
  info: "bg-info-bg text-info-fg border-info-bg",
  success: "bg-success-bg text-success-fg border-success-bg",
  warning: "bg-warning-bg text-warning-fg border-warning-bg",
  danger: "bg-danger-bg text-danger-fg border-danger-bg",
  brand: "bg-pink-bg text-pink-fg border-pink-bg",
};

/**
 * Solid fill with its foreground.
 *
 * The design system defines a `*-solid` value for success, warning and danger,
 * but those are chart and badge fills, not text backgrounds: white on
 * `success-solid` measures 3.2:1 and white on `warning-solid` only 2.2:1.
 * Where text sits on the fill we therefore use the `*-fg` step, which the
 * design system already provides and which clears 5:1 — except amber, which
 * keeps its designed colour and carries dark ink instead (6.9:1).
 *
 * This is the difference between changing a brand colour and choosing the right
 * token: every value below is one the design system defines.
 */
export const toneSolid: Record<Tone, string> = {
  neutral: "bg-heading text-inverse",
  primary: "bg-primary-600 text-inverse",
  info: "bg-info-fg text-inverse",
  success: "bg-success-fg text-inverse",
  warning: "bg-warning-solid text-ink",
  danger: "bg-danger-fg text-inverse",
  brand: "bg-gradient-brand text-inverse",
};

/** Foreground only — icons and accent text. */
export const toneText: Record<Tone, string> = {
  neutral: "text-muted",
  primary: "text-primary-600",
  info: "text-info-fg",
  success: "text-success-fg",
  warning: "text-warning-fg",
  danger: "text-danger-fg",
  brand: "text-primary-600",
};

/**
 * Role gradients, from the design system's Gradients group. Used for the
 * workspace cards and any surface that identifies a role at a glance.
 */
export const roleGradient = {
  developer: "bg-gradient-developer",
  reviewer: "bg-gradient-reviewer",
  admin: "bg-gradient-admin",
  brand: "bg-gradient-brand",
} as const;

export type RoleGradient = keyof typeof roleGradient;

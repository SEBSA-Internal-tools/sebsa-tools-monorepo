/**
 * Lifecycle states for an employee's *login*, as opposed to `profiles.status` which is the
 * lifecycle of the profile record itself (draft/published/archived). The two are independent:
 * a deactivated account keeps its published profile, which is the whole point of deactivating
 * rather than deleting.
 *
 * These are derived from Supabase Auth at read time rather than stored on `profiles` — see
 * services/account-service.ts for why, and for the derivation itself.
 *
 * Pure presentation data with no server-only imports, so Client Components can import this
 * directly (same constraint lib/roles.ts documents).
 */
export type AccountStatus = 'inactive' | 'pending' | 'active' | 'deactivated';

export interface AccountStatusPresentation {
  label: string;
  /** Tailwind classes for the chip body. */
  chip: string;
  /** Tailwind class for the leading status dot. */
  dot: string;
  /** Title of the confirmation dialog the chip opens. */
  actionLabel: string;
  /** Body copy explaining what confirming actually does. */
  actionDescription: string;
  /** Label on the confirm button. */
  confirmLabel: string;
  /** True for actions that remove access — renders the dialog in a destructive style. */
  destructive: boolean;
}

export const ACCOUNT_STATUS_UI: Record<AccountStatus, AccountStatusPresentation> = {
  inactive: {
    label: 'Inactive',
    chip: 'bg-slate-100 border-slate-200 text-slate-500',
    dot: 'bg-slate-400',
    actionLabel: 'Send verification mail',
    actionDescription:
      'Creates a login for this employee and emails them a secure one-time link to verify their address and set a password. The account stays Pending until they sign in.',
    confirmLabel: 'Send mail',
    destructive: false,
  },
  pending: {
    label: 'Pending',
    chip: 'bg-amber-50 border-amber-200/60 text-amber-700',
    dot: 'bg-amber-500',
    actionLabel: 'Resend invitation',
    actionDescription:
      'This employee was invited but has not signed in yet. Sends them a fresh sign-in link — the previous one stops working.',
    confirmLabel: 'Resend mail',
    destructive: false,
  },
  active: {
    label: 'Active',
    chip: 'bg-emerald-50 border-emerald-200/50 text-emerald-700',
    dot: 'bg-emerald-500',
    actionLabel: 'Deactivate user',
    actionDescription:
      'Revokes this employee’s access immediately — they will not be able to sign in. Their profile and all CV data stay in the system and the account can be reactivated at any time.',
    confirmLabel: 'Deactivate',
    destructive: true,
  },
  deactivated: {
    label: 'Deactivated',
    chip: 'bg-rose-50 border-rose-200/60 text-rose-700',
    dot: 'bg-rose-500',
    actionLabel: 'Reactivate user',
    actionDescription:
      'Restores this employee’s access using their existing credentials. They can sign in again straight away — no new invitation is needed.',
    confirmLabel: 'Reactivate',
    destructive: false,
  },
};

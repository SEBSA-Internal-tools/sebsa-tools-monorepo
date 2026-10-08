import { cn } from '@/components/ui';
import type { User } from '@sdp/contracts';
import { invite as copy } from '../content.ts';
import { describeInvite, userStatus, type UserStatus } from './inviteDisplay.ts';

const PILL_BASE =
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap';

const STATUS_TONE: Record<UserStatus, string> = {
  INVITED: 'border-info/30 bg-info-surface text-info',
  ACTIVE: 'bg-status-approved-surface text-status-approved',
  DEACTIVATED: 'bg-priority-low-surface text-priority-low',
};

/** Invited / Active / Deactivated. */
export function StatusPill({ user }: { user: User }) {
  const status = userStatus(user);
  return <span className={cn(PILL_BASE, STATUS_TONE[status])}>{copy.status[status]}</span>;
}

/** "Expires in 23 h", "Expired" or "Email failed" — blank for rows not invited. */
export function InviteCell({ user }: { user: User }) {
  const display = describeInvite(user);
  if (display === null) {
    return (
      <span className="text-sm text-ink-400" aria-label="No invite">
        —
      </span>
    );
  }
  return display.tone === 'warning' ? (
    <span className={cn(PILL_BASE, 'border-warning/30 bg-warning-surface text-warning')}>
      {display.text}
    </span>
  ) : (
    <span className="text-ink-600 text-sm">{display.text}</span>
  );
}

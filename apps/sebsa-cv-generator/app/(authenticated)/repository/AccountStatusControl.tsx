'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X, Loader2, Mail, ShieldOff, ShieldCheck, AlertTriangle } from 'lucide-react';
import { ACCOUNT_STATUS_UI, type AccountStatus } from '@/lib/accountStatus';
import { sendAccountInviteAction, setAccountAccessAction } from './actions';

interface AccountStatusControlProps {
  rowId: string;
  employeeName: string;
  status: AccountStatus;
  /** False for HR — the chip still renders, it just isn't clickable. */
  canManage: boolean;
}

const STATUS_ICON: Record<AccountStatus, React.ElementType> = {
  inactive: Mail,
  pending: Mail,
  active: ShieldOff,
  deactivated: ShieldCheck,
};

/**
 * The Account column chip. Read-only for anyone who can't manage accounts; otherwise a button
 * that opens a confirmation dialog for the one action that makes sense in the current state
 * (invite / resend / deactivate / reactivate).
 */
export default function AccountStatusControl({
  rowId,
  employeeName,
  status,
  canManage,
}: AccountStatusControlProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const ui = ACCOUNT_STATUS_UI[status];
  const Icon = STATUS_ICON[status];

  const chipBody = (
    <>
      <span className={`w-1.5 h-1.5 rounded-full ${ui.dot}`} />
      {ui.label}
    </>
  );
  const chipClasses =
    'text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded border flex items-center gap-1.5 w-fit';

  if (!canManage) {
    return <span className={`${chipClasses} ${ui.chip}`}>{chipBody}</span>;
  }

  const close = () => {
    if (isPending) return;
    setIsOpen(false);
    setError(null);
  };

  const confirm = () => {
    setError(null);
    startTransition(async () => {
      try {
        const result =
          status === 'active'
            ? await setAccountAccessAction(rowId, false)
            : status === 'deactivated'
            ? await setAccountAccessAction(rowId, true)
            : await sendAccountInviteAction(rowId);

        // Expected failures come back as values so the real reason survives to production,
        // where Next.js would otherwise replace a thrown error with an opaque digest.
        if (!result.ok) {
          setError(result.message);
          return;
        }

        setIsOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        title={ui.actionLabel}
        className={`${chipClasses} ${ui.chip} cursor-pointer transition-all hover:brightness-95 hover:shadow-sm active:scale-95`}
      >
        {chipBody}
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-label={ui.actionLabel}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-slate-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4 bg-slate-50/50">
              <div className="flex items-start gap-3">
                <span
                  className={`mt-0.5 p-2 rounded-xl ${
                    ui.destructive ? 'bg-rose-50 text-rose-600' : 'bg-indigo-50 text-indigo-600'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </span>
                <div>
                  <h4 className="text-sm font-black text-slate-800">{ui.actionLabel}</h4>
                  <p className="text-[11px] text-slate-500 font-medium mt-0.5">{employeeName}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={close}
                className="p-1.5 hover:bg-slate-200/65 rounded-lg text-slate-400 hover:text-slate-600 transition-colors cursor-pointer disabled:opacity-40"
                disabled={isPending}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 py-5">
              <p className="text-xs text-slate-600 leading-relaxed">{ui.actionDescription}</p>

              {error && (
                <div className="mt-4 flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-500 mt-0.5 shrink-0" />
                  <p className="text-[11px] text-rose-700 font-semibold leading-relaxed">{error}</p>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={close}
                disabled={isPending}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/65 rounded-full transition-colors cursor-pointer disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={isPending}
                className={`px-5 py-2 text-xs font-black uppercase tracking-wider text-white rounded-full shadow-md transition-all active:scale-95 cursor-pointer disabled:opacity-60 flex items-center gap-2 ${
                  ui.destructive
                    ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/10'
                    : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/10'
                }`}
              >
                {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {ui.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

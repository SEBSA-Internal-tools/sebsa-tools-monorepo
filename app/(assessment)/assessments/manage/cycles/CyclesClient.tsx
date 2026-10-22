'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageWrapper } from '@/app/components/PageWrapper';
import type { CycleSummary } from '@/services/assessment-admin-service';
import { createCycleAction, setCycleActiveAction } from '../actions';
import ConfirmDialog from '../ConfirmDialog';
import CycleFormModal from './CycleFormModal';
import { CheckCircle2, Plus, Power, PowerOff, XCircle } from 'lucide-react';

const STATUS_STYLE = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  closed: 'bg-slate-100 text-slate-600 border-slate-200',
  deactivated: 'bg-slate-100 text-slate-500 border-slate-200',
} as const;

const formatDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export default function CyclesClient({ cycles, recipientCount }: { cycles: CycleSummary[]; recipientCount: number }) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ cycle: CycleSummary; activate: boolean } | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasActive = cycles.some((c) => c.status === 'active');

  const create = (input: { label: string; passingScore: number }) => {
    setFormError(null);
    startTransition(async () => {
      const res = await createCycleAction(input);
      if (res.status === 'error') {
        setFormError(res.message);
        return;
      }
      setFormOpen(false);
      const { label, emailsSent, emailsFailed } = res.data;
      setMessage(
        emailsFailed
          ? { tone: 'error', text: `"${label}" is open. ${emailsSent} invitations sent, ${emailsFailed} failed. Use "Resend failed" on the tracker.` }
          : { tone: 'ok', text: `"${label}" is open and ${emailsSent} invitations were sent.` }
      );
      router.refresh();
    });
  };

  const toggle = () => {
    if (!confirm) return;
    const { cycle, activate } = confirm;
    startTransition(async () => {
      const res = await setCycleActiveAction(cycle.id, activate);
      setConfirm(null);
      setMessage(
        res.status === 'ok'
          ? { tone: 'ok', text: `"${cycle.label}" was ${activate ? 'reactivated' : 'deactivated'}.` }
          : { tone: 'error', text: res.message }
      );
      if (res.status === 'ok') router.refresh();
    });
  };

  return (
    <PageWrapper className="p-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-slate-900 font-sans leading-none">Assessment Cycles</h2>
          <p className="text-sm font-medium text-slate-500 mt-2">Open a cycle to invite everyone. Only one cycle can be active at a time.</p>
        </div>
        <button
          type="button"
          onClick={() => { setFormError(null); setFormOpen(true); }}
          disabled={hasActive}
          title={hasActive ? 'Deactivate the active cycle before opening a new one' : undefined}
          className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white font-sans text-xs font-black uppercase tracking-wider rounded-full shadow-lg shadow-indigo-600/10 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />New cycle
        </button>
      </div>

      {message && (
        <div role="status" className={`mb-5 flex items-start gap-3 rounded-2xl border p-4 text-xs font-semibold ${message.tone === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
          {message.tone === 'ok' ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <XCircle className="w-4 h-4 mt-0.5 shrink-0" />}
          {message.text}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100">
              <th className="px-5 py-3">Cycle</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Opened</th>
              <th className="px-5 py-3">Pass mark</th>
              <th className="px-5 py-3">Recipients</th>
              <th className="px-5 py-3">Started</th>
              <th className="px-5 py-3">Completed</th>
              <th className="px-5 py-3">Pass rate</th>
              <th className="px-5 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {cycles.map((c) => (
              <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                <td className="px-5 py-3.5">
                  <Link href={`/assessments/manage?cycle=${c.id}`} className="font-black text-slate-800 hover:text-indigo-600">{c.label}</Link>
                  {c.emailsFailed > 0 && <p className="text-[10px] font-black text-rose-600 mt-0.5">{c.emailsFailed} email(s) failed</p>}
                </td>
                <td className="px-5 py-3.5">
                  <span className={`px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-wider ${STATUS_STYLE[c.status]}`}>{c.status}</span>
                </td>
                <td className="px-5 py-3.5 font-semibold text-slate-600" suppressHydrationWarning>{formatDate(c.openedAt)}</td>
                <td className="px-5 py-3.5 font-semibold text-slate-600">{c.passingScore}/10</td>
                <td className="px-5 py-3.5 font-semibold text-slate-600">{c.recipients}</td>
                <td className="px-5 py-3.5 font-semibold text-slate-600">{c.started}</td>
                <td className="px-5 py-3.5 font-semibold text-slate-600">{c.completed}</td>
                <td className="px-5 py-3.5 font-black text-slate-700">{c.completed ? `${c.passRate}%` : '—'}</td>
                <td className="px-5 py-3.5 text-right">
                  {c.status === 'active' ? (
                    <button type="button" onClick={() => setConfirm({ cycle: c, activate: false })} className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-[11px] font-black transition-colors cursor-pointer">
                      <PowerOff className="w-3 h-3" />Deactivate
                    </button>
                  ) : c.status === 'deactivated' ? (
                    <button type="button" onClick={() => setConfirm({ cycle: c, activate: true })} disabled={hasActive} title={hasActive ? 'Another cycle is already active' : undefined} className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[11px] font-black transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
                      <Power className="w-3 h-3" />Reactivate
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
            {cycles.length === 0 && (
              <tr><td colSpan={9} className="px-5 py-12 text-center text-xs text-slate-400">No cycles yet. Open one to invite everyone.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {formOpen && (
        <CycleFormModal recipientCount={recipientCount} busy={isPending} error={formError} onSubmit={create} onClose={() => setFormOpen(false)} />
      )}

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.activate ? 'Reactivate this cycle?' : 'Deactivate this cycle?'}
        description={
          confirm?.activate
            ? 'People with a valid invitation will be able to take the assessment again.'
            : 'People will no longer be able to start or retry this assessment. Results and certificates are kept, and you can reactivate it later.'
        }
        confirmLabel={confirm?.activate ? 'Reactivate' : 'Deactivate'}
        destructive={confirm ? !confirm.activate : false}
        busy={isPending}
        onConfirm={toggle}
        onCancel={() => setConfirm(null)}
      />
    </PageWrapper>
  );
}

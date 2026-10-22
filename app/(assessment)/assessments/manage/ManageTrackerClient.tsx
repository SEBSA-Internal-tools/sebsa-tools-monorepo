'use client';

import React, { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageWrapper } from '@/app/components/PageWrapper';
import type { CycleSummary, TrackerData, TrackerStatus } from '@/services/assessment-admin-service';
import { resendFailedAction, resendInvitationAction } from './actions';
import { CheckCircle2, Loader2, MailWarning, RefreshCw, Search, Send, Users, XCircle } from 'lucide-react';

const STATUS_STYLE: Record<TrackerStatus, string> = {
  Pass: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  Fail: 'bg-rose-50 text-rose-700 border-rose-100',
  'Retry Available': 'bg-amber-50 text-amber-700 border-amber-100',
  'In Progress': 'bg-sky-50 text-sky-700 border-sky-100',
  'Not Started': 'bg-slate-100 text-slate-600 border-slate-200',
  Expired: 'bg-slate-100 text-slate-500 border-slate-200',
};
const FILTERS: ('All' | TrackerStatus)[] = ['All', 'Pass', 'Fail', 'Retry Available', 'In Progress', 'Not Started', 'Expired'];

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export default function ManageTrackerClient({ cycles, tracker }: { cycles: CycleSummary[]; tracker: TrackerData | null }) {
  const router = useRouter();
  const [filter, setFilter] = useState<'All' | TrackerStatus>('All');
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const cycle = tracker?.cycle ?? null;
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (tracker?.rows ?? []).filter(
      (r) => (filter === 'All' || r.status === filter) && (!q || r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q))
    );
  }, [tracker, filter, query]);

  const run = (key: string, op: () => Promise<{ status: 'ok' | 'error'; message?: string; text?: string }>) => {
    setMessage(null);
    setBusyKey(key);
    startTransition(async () => {
      const res = await op();
      setMessage({ tone: res.status === 'ok' ? 'ok' : 'error', text: res.text ?? res.message ?? '' });
      setBusyKey(null);
      if (res.status === 'ok') router.refresh();
    });
  };

  const resendOne = (userId: string) =>
    run(`one:${userId}`, async () => {
      const res = await resendInvitationAction(cycle!.id, userId);
      if (res.status === 'error') return res;
      return res.data.error
        ? { status: 'error' as const, message: `Invitation updated, but the email failed: ${res.data.error}` }
        : { status: 'ok' as const, text: `Invitation resent to ${res.data.email}.` };
    });

  const resendFailed = () =>
    run('bulk', async () => {
      const res = await resendFailedAction(cycle!.id);
      if (res.status === 'error') return res;
      const { attempted, delivered, failed } = res.data;
      if (attempted === 0) return { status: 'ok' as const, text: 'There are no failed invitations to resend.' };
      return failed
        ? { status: 'error' as const, message: `${delivered} of ${attempted} resent; ${failed} still failed.` }
        : { status: 'ok' as const, text: `All ${attempted} failed invitations were resent.` };
    });

  const kpis = cycle
    ? [
        { title: 'Recipients', value: cycle.recipients, icon: Users, gradient: 'from-purple-800 via-violet-900 to-slate-950', iconColor: 'text-purple-200', labelColor: 'text-violet-200' },
        { title: 'Completed', value: `${cycle.completed}`, icon: CheckCircle2, gradient: 'from-indigo-900 to-slate-950', iconColor: 'text-sky-300', labelColor: 'text-indigo-300' },
        { title: 'Pass rate', value: `${cycle.passRate}%`, icon: Send, gradient: 'from-slate-800 to-slate-950', iconColor: 'text-emerald-300', labelColor: 'text-slate-300' },
        { title: 'Emails failed', value: cycle.emailsFailed, icon: MailWarning, gradient: 'from-rose-900 to-slate-950', iconColor: 'text-rose-200', labelColor: 'text-rose-200' },
      ]
    : [];

  return (
    <PageWrapper className="p-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-slate-900 font-sans leading-none">Assessment Tracker</h2>
          <p className="text-sm font-medium text-slate-500 mt-2">See who has been invited, who has finished, and who needs a nudge.</p>
        </div>
        {cycles.length > 0 && (
          <select
            aria-label="Assessment cycle"
            value={cycle?.id ?? ''}
            onChange={(e) => router.push(`/assessments/manage?cycle=${e.target.value}`)}
            className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            {cycles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label} ({c.status})
              </option>
            ))}
          </select>
        )}
      </div>

      {!cycle ? (
        <div className="bg-white p-10 rounded-2xl border border-slate-200/80 shadow-sm text-center max-w-xl">
          <p className="text-sm font-black text-slate-800">No assessment cycles yet</p>
          <p className="text-xs font-medium text-slate-500 mt-2">Open a cycle to invite everyone and start tracking results.</p>
          <Link href="/assessments/manage/cycles" className="mt-5 inline-flex px-6 py-2.5 bg-indigo-600 text-white text-xs font-black uppercase tracking-wider rounded-full hover:bg-indigo-700 transition-colors">
            Go to cycles
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {kpis.map((kpi) => {
              const Icon = kpi.icon;
              return (
                <div key={kpi.title} className={`bg-gradient-to-br ${kpi.gradient} text-white p-5 rounded-2xl shadow-xl border border-slate-800`}>
                  <div className="p-3 bg-white/10 rounded-xl w-fit mb-4"><Icon className={`w-5 h-5 ${kpi.iconColor}`} /></div>
                  <p className={`text-xs font-bold ${kpi.labelColor} uppercase tracking-widest mb-1.5`}>{kpi.title}</p>
                  <h3 className="text-3xl font-black text-white tracking-tight font-sans">{kpi.value}</h3>
                </div>
              );
            })}
          </div>

          {message && (
            <div role="status" className={`mb-5 flex items-start gap-3 rounded-2xl border p-4 text-xs font-semibold ${message.tone === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
              {message.tone === 'ok' ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <XCircle className="w-4 h-4 mt-0.5 shrink-0" />}
              {message.text}
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm">
            <div className="p-5 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex gap-1.5 flex-wrap">
                {FILTERS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilter(f)}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-black transition-colors cursor-pointer ${filter === f ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search name or email"
                    aria-label="Search people"
                    className="bg-slate-100/90 border border-slate-200/50 rounded-full py-2 pl-10 pr-4 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-500/10 placeholder:text-slate-400"
                  />
                </div>
                {cycle.status === 'active' && cycle.emailsFailed > 0 && (
                  <button
                    type="button"
                    onClick={resendFailed}
                    disabled={isPending}
                    className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 text-white font-bold rounded-xl text-xs hover:bg-slate-900 disabled:opacity-50 transition-colors cursor-pointer shadow-sm"
                  >
                    {busyKey === 'bulk' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    Resend {cycle.emailsFailed} failed
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100">
                    <th className="px-5 py-3">Person</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Score</th>
                    <th className="px-5 py-3">Attempts</th>
                    <th className="px-5 py-3">Completed</th>
                    <th className="px-5 py-3">Invitation</th>
                    <th className="px-5 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.userId} className="border-b border-slate-50 hover:bg-slate-50/60">
                      <td className="px-5 py-3.5">
                        <p className="font-black text-slate-800">{r.name}</p>
                        <p className="text-[10px] font-semibold text-slate-400">{r.email}</p>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-wider ${STATUS_STYLE[r.status]}`}>{r.status}</span>
                      </td>
                      <td className="px-5 py-3.5 font-black text-slate-700">{r.score !== null ? `${r.score}/10` : '—'}</td>
                      <td className="px-5 py-3.5 font-semibold text-slate-600">{r.attemptCount}</td>
                      <td className="px-5 py-3.5 font-semibold text-slate-600" suppressHydrationWarning>{formatDate(r.submittedAt)}</td>
                      <td className="px-5 py-3.5">
                        <p className="font-semibold text-slate-600" suppressHydrationWarning>Expires {formatDate(r.expiresAt)}</p>
                        {r.emailStatus === 'failed' && (
                          <p className="flex items-center gap-1 text-[10px] font-black text-rose-600 mt-0.5" title={r.emailError ?? undefined}>
                            <MailWarning className="w-3 h-3" />Email failed
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {cycle.status === 'active' && r.status !== 'Pass' && r.status !== 'Fail' && (
                          <button
                            type="button"
                            onClick={() => resendOne(r.userId)}
                            disabled={isPending}
                            className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[11px] font-black transition-all disabled:opacity-40 cursor-pointer"
                          >
                            {busyKey === `one:${r.userId}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}Resend
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr><td colSpan={7} className="px-5 py-12 text-center text-xs text-slate-400">No one matches this filter.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </PageWrapper>
  );
}

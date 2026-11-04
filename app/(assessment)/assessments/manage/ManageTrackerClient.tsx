'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageWrapper } from '@/app/components/PageWrapper';
import type { CycleSummary, TrackerData, TrackerStatus } from '@/services/assessment-admin-service';
import { CheckCircle2, MailWarning, Search, Send, Users } from 'lucide-react';
import { Pagination } from '@/app/components/Pagination';
import type { PaginatedResult } from '@/lib/pagination';
import type { TrackerRow } from '@/services/assessment-admin-service';
import { listCycleRecipientsPageAction, listCycleSummariesPageAction } from './actions';

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

export default function ManageTrackerClient({ initialCycles, tracker, initialRecipients }: { initialCycles: PaginatedResult<CycleSummary>; tracker: TrackerData | null; initialRecipients: PaginatedResult<TrackerRow> | null }) {
  const router = useRouter();
  const [cyclesResult, setCyclesResult] = useState(initialCycles);
  const [cyclePage, setCyclePage] = useState(initialCycles.page);
  const [cyclePageSize, setCyclePageSize] = useState(initialCycles.pageSize);
  const [filter, setFilter] = useState<'All' | TrackerStatus>('All');
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState(initialRecipients?.items ?? []);
  const [total, setTotal] = useState(initialRecipients?.total ?? 0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const cycles = cyclesResult.items;

  useEffect(() => {
    listCycleSummariesPageAction({ page: cyclePage, pageSize: cyclePageSize }).then((res) => {
      if (res.status === 'ok') setCyclesResult(res.data);
    });
  }, [cyclePage, cyclePageSize]);

  const cycle = tracker?.cycle ?? null;
  useEffect(() => {
    if (!tracker?.cycle.id) return;
    const timer = setTimeout(() => {
      setLoading(true);
      listCycleRecipientsPageAction(tracker.cycle.id, page, pageSize, query, filter).then((res) => {
        if (res.status === 'ok') { setRows(res.data.items); setTotal(res.data.total); }
      }).finally(() => setLoading(false));
    }, query ? 250 : 0);
    return () => clearTimeout(timer);
  }, [tracker?.cycle.id, page, pageSize, query, filter]);

  const kpis = cycle
    ? [
        { title: 'Recipients', value: cycle.recipients, icon: Users, gradient: 'from-purple-800 via-violet-900 to-slate-950', iconColor: 'text-purple-200', labelColor: 'text-violet-200' },
        { title: 'Completed', value: `${cycle.completed}`, icon: CheckCircle2, gradient: 'from-indigo-900 to-slate-950', iconColor: 'text-sky-300', labelColor: 'text-indigo-300' },
        { title: 'Pass rate', value: `${cycle.passRate}%`, icon: Send, gradient: 'from-slate-800 to-slate-950', iconColor: 'text-emerald-300', labelColor: 'text-slate-300' },
        { title: 'Emails failed', value: cycle.emailsFailed + cycle.reminderEmailsFailed, icon: MailWarning, gradient: 'from-rose-900 to-slate-950', iconColor: 'text-rose-200', labelColor: 'text-rose-200' },
      ]
    : [];

  return (
    <PageWrapper className="p-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-slate-900 font-sans leading-none">Assessment Tracker</h2>
          <p className="text-sm font-medium text-slate-500 mt-2">See who has been invited, who has finished, and who needs a nudge.</p>
        </div>
        {cyclesResult.total > 0 && (
          <div className="min-w-[320px]">
          <select
            aria-label="Assessment cycle"
            value={cycle?.id ?? ''}
            onChange={(e) => router.push(`/assessments/manage?cycle=${e.target.value}&cyclePage=${cyclePage}&cyclePageSize=${cyclePageSize}`)}
            className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            {cycles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label} ({c.status})
              </option>
            ))}
          </select>
          <Pagination page={cyclePage} pageSize={cyclePageSize} total={cyclesResult.total}
            onPageChange={setCyclePage} onPageSizeChange={(size) => { setCyclePageSize(size); setCyclePage(1); }} />
          </div>
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

          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm">
            <div className="p-5 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex gap-1.5 flex-wrap">
                {FILTERS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => { setFilter(f); setPage(1); }}
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
                    onChange={(e) => { setQuery(e.target.value); setPage(1); }}
                    placeholder="Search name or email"
                    aria-label="Search people"
                    className="bg-slate-100/90 border border-slate-200/50 rounded-full py-2 pl-10 pr-4 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-500/10 placeholder:text-slate-400"
                  />
                </div>
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
                        {r.reminderStatus === 'failed' && (
                          <p className="flex items-center gap-1 text-[10px] font-black text-rose-600 mt-0.5" title={r.reminderError ?? undefined}>
                            <MailWarning className="w-3 h-3" />Reminder failed
                          </p>
                        )}
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr><td colSpan={6} className="px-5 py-12 text-center text-xs text-slate-400">No one matches this filter.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={pageSize} total={total} disabled={loading}
              onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
          </div>
        </>
      )}
    </PageWrapper>
  );
}

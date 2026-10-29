'use client';

import React, { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { PageWrapper } from '@/app/components/PageWrapper';
import type { CycleSummary, TrackerRow, TrackerStatus } from '@/services/assessment-admin-service';
import {
  createCycleAction,
  listCycleRecipientsAction,
  resendFailedAction,
  resendInvitationAction,
  retryFailedEmailAction,
  sendRemindersAction,
  setCycleActiveAction,
} from '../actions';
import ConfirmDialog from '../ConfirmDialog';
import CycleFormModal from './CycleFormModal';
import {
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  Loader2,
  MailWarning,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  Search,
  Send,
  Users,
  XCircle,
} from 'lucide-react';

type CycleStatus = CycleSummary['status'];
type StatusFilter = 'all' | CycleStatus;
type DateMode = 'none' | 'month' | 'custom';

const STATUS_STYLE: Record<CycleStatus, string> = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  closed: 'bg-slate-100 text-slate-600 border-slate-200',
  deactivated: 'bg-slate-100 text-slate-500 border-slate-200',
};

const RECIPIENT_STATUS_STYLE: Record<TrackerStatus, string> = {
  Pass: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  Fail: 'bg-rose-50 text-rose-700 border-rose-100',
  'Retry Available': 'bg-amber-50 text-amber-700 border-amber-100',
  'In Progress': 'bg-sky-50 text-sky-700 border-sky-100',
  'Not Started': 'bg-slate-100 text-slate-600 border-slate-200',
  Expired: 'bg-slate-100 text-slate-500 border-slate-200',
};

const STATUS_FILTERS: StatusFilter[] = ['all', 'active', 'closed', 'deactivated'];

const formatDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const monthKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

type RecipientState = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; rows: TrackerRow[] };

export default function CyclesClient({ cycles, people }: { cycles: CycleSummary[]; people: { userId: string; name: string; email: string }[] }) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ cycle: CycleSummary; activate: boolean } | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  // Filters / sort
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [order, setOrder] = useState<'newest' | 'oldest'>('newest');
  const [dateMode, setDateMode] = useState<DateMode>('none');
  const [monthValue, setMonthValue] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Expandable recipient lists (lazy-loaded per cycle)
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [recipients, setRecipients] = useState<Record<string, RecipientState>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const hasActive = cycles.some((c) => c.status === 'active');

  const monthOptions = useMemo(() => {
    const seen = new Map<string, string>();
    cycles.forEach((c) => {
      const key = monthKey(c.openedAt);
      if (!seen.has(key)) seen.set(key, new Date(c.openedAt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }));
    });
    return [...seen.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [cycles]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const fromTs = fromDate ? new Date(fromDate).getTime() : null;
    const toTs = toDate ? new Date(toDate).getTime() + 24 * 60 * 60 * 1000 - 1 : null; // include the whole "to" day

    const filtered = cycles.filter((c) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (q && !c.label.toLowerCase().includes(q)) return false;
      if (dateMode === 'month' && monthValue && monthKey(c.openedAt) !== monthValue) return false;
      if (dateMode === 'custom') {
        const ts = new Date(c.openedAt).getTime();
        if (fromTs !== null && ts < fromTs) return false;
        if (toTs !== null && ts > toTs) return false;
      }
      return true;
    });

    return filtered.sort((a, b) => {
      const diff = new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime();
      return order === 'newest' ? diff : -diff;
    });
  }, [cycles, query, statusFilter, dateMode, monthValue, fromDate, toDate, order]);

  const create = (input: { label: string; passingScore: number; employeeIds: string[] }) => {
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
          ? { tone: 'error', text: `"${label}" is open. ${emailsSent} invitations sent, ${emailsFailed} failed. Expand the cycle to resend failed ones.` }
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

  const loadRecipients = async (cycleId: string) => {
    setRecipients((prev) => ({ ...prev, [cycleId]: { state: 'loading' } }));
    const res = await listCycleRecipientsAction(cycleId);
    setRecipients((prev) => ({
      ...prev,
      [cycleId]: res.status === 'ok' ? { state: 'ready', rows: res.data } : { state: 'error', message: res.message },
    }));
  };

  const toggleExpand = (cycleId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(cycleId)) next.delete(cycleId);
      else next.add(cycleId);
      return next;
    });
    if (!recipients[cycleId]) void loadRecipients(cycleId);
  };

  const resendOne = (cycleId: string, userId: string) => {
    setMessage(null);
    setBusyKey(`one:${userId}`);
    startTransition(async () => {
      const res = await resendInvitationAction(cycleId, userId);
      setBusyKey(null);
      if (res.status === 'error') {
        setMessage({ tone: 'error', text: res.message });
        return;
      }
      setMessage(
        res.data.error
          ? { tone: 'error', text: `Invitation updated, but the email failed: ${res.data.error}` }
          : { tone: 'ok', text: `Invitation resent to ${res.data.email}.` }
      );
      await loadRecipients(cycleId);
      router.refresh();
    });
  };

  const resendFailed = (cycleId: string) => {
    setMessage(null);
    setBusyKey(`bulk:${cycleId}`);
    startTransition(async () => {
      const res = await resendFailedAction(cycleId);
      setBusyKey(null);
      if (res.status === 'error') {
        setMessage({ tone: 'error', text: res.message });
        return;
      }
      const { attempted, delivered, failed } = res.data;
      setMessage(
        attempted === 0
          ? { tone: 'ok', text: 'There are no failed invitations to resend.' }
          : failed
            ? { tone: 'error', text: `${delivered} of ${attempted} resent; ${failed} still failed.` }
            : { tone: 'ok', text: `All ${attempted} failed invitations were resent.` }
      );
      await loadRecipients(cycleId);
      router.refresh();
    });
  };

  const sendReminders = (cycleId: string) => {
    setMessage(null);
    setBusyKey(`reminders:${cycleId}`);
    startTransition(async () => {
      const res = await sendRemindersAction(cycleId);
      setBusyKey(null);
      if (res.status === 'error') setMessage({ tone: 'error', text: res.message });
      else {
        const { eligible, attempted, delivered, failed } = res.data;
        setMessage(failed
          ? { tone: 'error', text: `${delivered} reminders sent and ${failed} failed.` }
          : { tone: 'ok', text: attempted ? `${delivered} reminders sent to ${eligible} incomplete employees.` : 'No new reminders were required.' });
      }
      await loadRecipients(cycleId);
      router.refresh();
    });
  };

  const retryFailedEmail = (cycleId: string, userId: string, emailType: 'invitation' | 'reminder') => {
    setMessage(null);
    setBusyKey(`retry:${emailType}:${userId}`);
    startTransition(async () => {
      const res = await retryFailedEmailAction(cycleId, userId, emailType);
      setBusyKey(null);
      setMessage(res.status === 'error'
        ? { tone: 'error', text: res.message }
        : res.data.error
          ? { tone: 'error', text: `${emailType} retry failed: ${res.data.error}` }
          : { tone: 'ok', text: `${emailType === 'invitation' ? 'Invitation' : 'Reminder'} sent to ${res.data.email}.` });
      await loadRecipients(cycleId);
      router.refresh();
    });
  };

  const inputCls =
    'bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20';

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

      {/* Controls */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 mb-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex gap-1.5 flex-wrap">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setStatusFilter(f)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-black capitalize transition-colors cursor-pointer ${statusFilter === f ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {f === 'all' ? 'All' : f}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by cycle name"
              aria-label="Search cycles"
              className="bg-slate-100/90 border border-slate-200/50 rounded-full py-2 pl-10 pr-4 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-500/10 placeholder:text-slate-400"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t border-slate-100">
          <label className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-slate-500">
            Sort by date sent
            <select value={order} onChange={(e) => setOrder(e.target.value as 'newest' | 'oldest')} aria-label="Sort order" className={inputCls}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </label>

          <label className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-slate-500">
            <CalendarRange className="w-3.5 h-3.5 text-slate-400" />Date sent
            <select
              value={dateMode}
              onChange={(e) => setDateMode(e.target.value as DateMode)}
              aria-label="Date filter mode"
              className={inputCls}
            >
              <option value="none">None</option>
              <option value="month">Month-Year</option>
              <option value="custom">Custom range</option>
            </select>
          </label>

          {dateMode === 'month' && (
            <select value={monthValue} onChange={(e) => setMonthValue(e.target.value)} aria-label="Month" className={inputCls}>
              <option value="">All months</option>
              {monthOptions.map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          )}

          {dateMode === 'custom' && (
            <div className="flex items-center gap-2">
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} aria-label="From date" className={inputCls} />
              <span className="text-xs font-bold text-slate-400">to</span>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} aria-label="To date" className={inputCls} />
            </div>
          )}

          <span className="ml-auto text-[11px] font-bold text-slate-400">
            {visible.length} of {cycles.length} {cycles.length === 1 ? 'cycle' : 'cycles'}
          </span>
        </div>
      </div>

      {/* Cards */}
      {visible.length === 0 ? (
        <div className="bg-white p-10 rounded-2xl border border-slate-200/80 shadow-sm text-center">
          <p className="text-sm font-black text-slate-800">{cycles.length === 0 ? 'No cycles yet' : 'No cycles match these filters'}</p>
          <p className="text-xs font-medium text-slate-500 mt-2">{cycles.length === 0 ? 'Open one to invite everyone.' : 'Try clearing the search or filters.'}</p>
        </div>
      ) : (
        <div className="space-y-5">
          {visible.map((c) => {
            const isOpen = expanded.has(c.id);
            const completionPct = c.recipients ? Math.round((c.completed / c.recipients) * 100) : 0;
            const stats: { label: string; value: string | number; danger?: boolean }[] = [
              { label: 'Recipients', value: c.recipients },
              { label: 'Emails sent', value: c.emailsSent },
              { label: 'Failed', value: c.emailsFailed, danger: c.emailsFailed > 0 },
              { label: 'Reminder failed', value: c.reminderEmailsFailed, danger: c.reminderEmailsFailed > 0 },
              { label: 'Expired', value: c.expiredInvitations },
              { label: 'Completed', value: c.completed },
              { label: 'Pass rate', value: c.completed ? `${c.passRate}%` : '—' },
            ];

            return (
              <div key={c.id} className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                <div className="p-6">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="text-lg font-black text-slate-900">{c.label}</h3>
                        <span className={`px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-wider ${STATUS_STYLE[c.status]}`}>{c.status}</span>
                      </div>
                      <p className="text-[11px] font-semibold text-slate-400 mt-1.5" suppressHydrationWarning>
                        Sent {formatDate(c.openedAt)} · Pass mark {c.passingScore}/10
                      </p>
                    </div>
                    <div className="shrink-0">
                      {c.status === 'active' ? (
                        <button type="button" onClick={() => setConfirm({ cycle: c, activate: false })} className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-[11px] font-black transition-colors cursor-pointer">
                          <PowerOff className="w-3.5 h-3.5" />Deactivate
                        </button>
                      ) : c.status === 'deactivated' ? (
                        <button type="button" onClick={() => setConfirm({ cycle: c, activate: true })} disabled={hasActive} title={hasActive ? 'Another cycle is already active' : undefined} className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[11px] font-black transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
                          <Power className="w-3.5 h-3.5" />Reactivate
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-5">
                    {stats.map((s) => (
                      <div key={s.label} className="rounded-xl border border-slate-100 bg-slate-50/60 px-3.5 py-3">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{s.label}</p>
                        <p className={`text-xl font-black mt-1 tabular-nums ${s.danger ? 'text-rose-600' : 'text-slate-800'}`}>{s.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5">
                    <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-slate-500 mb-2">
                      <span>Completion</span>
                      <span>{c.completed} of {c.recipients} · {completionPct}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-200/70 overflow-hidden">
                      <div className="h-full bg-indigo-600 transition-all duration-300" style={{ width: `${completionPct}%` }} />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleExpand(c.id)}
                    aria-expanded={isOpen}
                    className="mt-5 inline-flex items-center gap-1.5 text-[11px] font-black text-indigo-600 hover:text-indigo-700 uppercase tracking-wide cursor-pointer"
                  >
                    <Users className="w-3.5 h-3.5" />
                    {isOpen ? 'Hide recipients' : `View recipients (${c.recipients})`}
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                </div>

                {isOpen && (
                  <RecipientPanel
                    cycle={c}
                    data={recipients[c.id]}
                    busyKey={busyKey}
                    disabled={isPending}
                    onResendOne={(userId) => resendOne(c.id, userId)}
                    onResendFailed={() => resendFailed(c.id)}
                    onSendReminders={() => sendReminders(c.id)}
                    onRetryFailed={(userId, emailType) => retryFailedEmail(c.id, userId, emailType)}
                    onReload={() => loadRecipients(c.id)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {formOpen && (
        <CycleFormModal people={people} busy={isPending} error={formError} onSubmit={create} onClose={() => setFormOpen(false)} />
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

function RecipientPanel({
  cycle,
  data,
  busyKey,
  disabled,
  onResendOne,
  onResendFailed,
  onSendReminders,
  onRetryFailed,
  onReload,
}: {
  cycle: CycleSummary;
  data: RecipientState | undefined;
  busyKey: string | null;
  disabled: boolean;
  onResendOne: (userId: string) => void;
  onResendFailed: () => void;
  onSendReminders: () => void;
  onRetryFailed: (userId: string, emailType: 'invitation' | 'reminder') => void;
  onReload: () => void;
}) {
  const canResend = cycle.status === 'active';

  return (
    <div className="border-t border-slate-100 bg-slate-50/40">
      <div className="flex items-center justify-between gap-3 px-6 py-3">
        <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">Recipients</p>
        <div className="flex items-center gap-2">
        {canResend && (
          <button type="button" onClick={onSendReminders} disabled={disabled} className="flex items-center gap-2 px-3.5 py-2 bg-indigo-600 text-white font-bold rounded-xl text-[11px] hover:bg-indigo-700 disabled:opacity-50 transition-colors cursor-pointer">
            {busyKey === `reminders:${cycle.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}Send reminders
          </button>
        )}
        {canResend && cycle.emailsFailed > 0 && (
          <button
            type="button"
            onClick={onResendFailed}
            disabled={disabled}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 text-white font-bold rounded-xl text-[11px] hover:bg-slate-900 disabled:opacity-50 transition-colors cursor-pointer"
          >
            {busyKey === `bulk:${cycle.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Resend {cycle.emailsFailed} failed
          </button>
        )}
        </div>
      </div>

      {(!data || data.state === 'loading') && (
        <div className="flex items-center gap-2 px-6 py-8 text-xs font-semibold text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" />Loading recipients…
        </div>
      )}

      {data?.state === 'error' && (
        <div className="px-6 py-8 text-center">
          <p className="text-xs font-semibold text-rose-600">{data.message}</p>
          <button type="button" onClick={onReload} className="mt-2 text-[11px] font-black text-indigo-600 hover:text-indigo-700 uppercase tracking-wide cursor-pointer">Try again</button>
        </div>
      )}

      {data?.state === 'ready' && (
        data.rows.length === 0 ? (
          <p className="px-6 py-8 text-center text-xs text-slate-400">No one was invited to this cycle.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-200/70">
                  <th className="px-6 py-2.5">Person</th>
                  <th className="px-6 py-2.5">Result</th>
                  <th className="px-6 py-2.5">Score</th>
                  <th className="px-6 py-2.5">Attempts</th>
                  <th className="px-6 py-2.5">Invitation</th>
                  <th className="px-6 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.userId} className="border-b border-slate-100 last:border-b-0 hover:bg-white/70">
                    <td className="px-6 py-3">
                      <p className="font-black text-slate-800">{r.name}</p>
                      <p className="text-[10px] font-semibold text-slate-400">{r.email}</p>
                    </td>
                    <td className="px-6 py-3">
                      <span className={`px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-wider ${RECIPIENT_STATUS_STYLE[r.status]}`}>{r.status}</span>
                    </td>
                    <td className="px-6 py-3 font-black text-slate-700">{r.score !== null ? `${r.score}/10` : '—'}</td>
                    <td className="px-6 py-3 font-semibold text-slate-600">{r.attemptCount}</td>
                    <td className="px-6 py-3">
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
                    <td className="px-6 py-3 text-right">
                      {canResend && r.emailStatus === 'failed' ? (
                        <button type="button" onClick={() => onRetryFailed(r.userId, 'invitation')} disabled={disabled} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[11px] font-black disabled:opacity-40 cursor-pointer">
                          {busyKey === `retry:invitation:${r.userId}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}Retry invitation
                        </button>
                      ) : canResend && r.reminderStatus === 'failed' ? (
                        <button type="button" onClick={() => onRetryFailed(r.userId, 'reminder')} disabled={disabled} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[11px] font-black disabled:opacity-40 cursor-pointer">
                          {busyKey === `retry:reminder:${r.userId}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}Retry reminder
                        </button>
                      ) : canResend && r.status !== 'Pass' && r.status !== 'Fail' && (
                        <button
                          type="button"
                          onClick={() => onResendOne(r.userId)}
                          disabled={disabled}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-black transition-all disabled:opacity-40 cursor-pointer"
                        >
                          {busyKey === `one:${r.userId}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}Resend
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}

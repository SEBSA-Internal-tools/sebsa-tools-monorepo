'use client';

import React, { useEffect, useState } from 'react';
import { Loader2, Search, Send, X } from 'lucide-react';
import type { UserRole } from '@/lib/roles';
import type { PaginatedResult } from '@/lib/pagination';
import { Pagination } from '@/app/components/Pagination';
import { listInvitablePeoplePageAction } from '../actions';

interface CycleFormModalProps {
  initialPage: PaginatedResult<{ userId: string; name: string; email: string; role: UserRole; deactivated: boolean }>;
  busy: boolean;
  error: string | null;
  onSubmit: (input: { label: string; passingScore: number; selectAll: boolean; excludedIds: string[] }) => void;
  onClose: () => void;
}

const inputCls =
  'w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400';

/** Collects cycle settings and the employees who should receive invitations. */
export default function CycleFormModal({ initialPage, busy, error, onSubmit, onClose }: CycleFormModalProps) {
  const [label, setLabel] = useState('');
  const [passingScore, setPassingScore] = useState(8);
  const [excluded, setExcluded] = useState(() => new Set<string>());
  const [query, setQuery] = useState('');
  const [peoplePage, setPeoplePage] = useState(initialPage);
  const [page, setPage] = useState(initialPage.page);
  const [pageSize, setPageSize] = useState(initialPage.pageSize);
  const [loading, setLoading] = useState(false);
  const visiblePeople = peoplePage.items;
  const allVisibleSelected = visiblePeople.length > 0 && visiblePeople.every((person) => !excluded.has(person.userId));
  const selectedCount = Math.max(0, peoplePage.total - excluded.size);
  const valid = label.trim().length >= 3 && passingScore >= 0 && passingScore <= 10 && selectedCount > 0;

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(true);
      listInvitablePeoplePageAction(page, pageSize, query).then((res) => {
        if (res.status === 'ok') setPeoplePage(res.data);
      }).finally(() => setLoading(false));
    }, query ? 250 : 0);
    return () => clearTimeout(timer);
  }, [page, pageSize, query]);

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 md:p-6" role="dialog" aria-modal="true">
      <form
        className="w-full min-w-0 max-w-md max-h-[calc(100vh-2rem)] overflow-x-hidden overflow-y-auto bg-white rounded-2xl shadow-xl p-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && !busy) onSubmit({ label: label.trim(), passingScore, selectAll: true, excludedIds: [...excluded] });
        }}
      >
        <div className="flex items-start justify-between">
          <h3 className="text-lg font-black tracking-tight text-slate-900">Open a new cycle</h3>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">Cycle label</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. 2027 H1" maxLength={80} className={`${inputCls} mt-1.5`} autoFocus />
          </label>
          <fieldset className="min-w-0 max-w-full overflow-hidden">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <legend className="min-w-0 text-[11px] font-black uppercase tracking-wider text-slate-500">Recipients</legend>
              <button
                type="button"
                onClick={() => setExcluded((current) => {
                  const next = new Set(current);
                  visiblePeople.forEach((person) => allVisibleSelected ? next.add(person.userId) : next.delete(person.userId));
                  return next;
                })}
                disabled={visiblePeople.length === 0}
                className="shrink-0 whitespace-nowrap text-[11px] font-black text-indigo-600 disabled:text-slate-300"
              >
                {allVisibleSelected ? 'Clear visible' : 'Select visible'}
              </button>
            </div>
            <div className="relative mt-2 min-w-0 max-w-full">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={query}
                onChange={(event) => { setQuery(event.target.value); setPage(1); }}
                placeholder="Search name, email, or role"
                aria-label="Search assessment recipients"
                className={`${inputCls} box-border min-w-0 max-w-full pl-9`}
              />
            </div>
            <div className="mt-2 w-full min-w-0 max-w-full max-h-52 overflow-x-hidden overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
              {visiblePeople.map((person) => (
                <label key={person.userId} className="flex w-full min-w-0 items-center gap-3 px-3.5 py-2.5 hover:bg-slate-50 cursor-pointer">
                  <input type="checkbox" checked={!excluded.has(person.userId)} onChange={() => setExcluded((current) => {
                    const next = new Set(current);
                    if (next.has(person.userId)) next.delete(person.userId); else next.add(person.userId);
                    return next;
                  })} className="shrink-0 accent-indigo-600" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-black text-slate-800 truncate">{person.name}</span>
                    <span className="block text-[10px] font-semibold text-slate-400 truncate">{person.email}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-slate-600">
                    {person.role.replace('_', ' ')}
                  </span>
                </label>
              ))}
              {visiblePeople.length === 0 && <p className="p-4 text-xs text-slate-500">No active users match your search.</p>}
            </div>
            <Pagination page={page} pageSize={pageSize} total={peoplePage.total} disabled={loading || busy}
              onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
          </fieldset>
          <label className="block">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">Passing score (out of 10)</span>
            <input type="number" min={0} max={10} value={passingScore} onChange={(e) => setPassingScore(Number(e.target.value))} className={`${inputCls} mt-1.5`} />
          </label>
        </div>

        <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs font-semibold text-amber-800 leading-relaxed">
          Opening this cycle emails an invitation to <strong>{selectedCount}</strong> selected {selectedCount === 1 ? 'user' : 'users'} straight away.
          Invitations are valid for 7 days.
        </p>

        {error && <p role="alert" className="mt-4 text-xs font-semibold text-rose-600">{error}</p>}

        <div className="flex justify-end gap-2 mt-6">
          <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl text-xs hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer">
            Cancel
          </button>
          <button type="submit" disabled={!valid || busy} className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-xs font-black rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            {busy ? 'Sending…' : 'Open cycle and send'}
          </button>
        </div>
      </form>
    </div>
  );
}

'use client';

import React, { useState } from 'react';
import { Loader2, Send, X } from 'lucide-react';

interface CycleFormModalProps {
  people: { userId: string; name: string; email: string }[];
  busy: boolean;
  error: string | null;
  onSubmit: (input: { label: string; passingScore: number; employeeIds: string[] }) => void;
  onClose: () => void;
}

const inputCls =
  'w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400';

/** Collects cycle settings and the employees who should receive invitations. */
export default function CycleFormModal({ people, busy, error, onSubmit, onClose }: CycleFormModalProps) {
  const [label, setLabel] = useState('');
  const [passingScore, setPassingScore] = useState(8);
  const [selected, setSelected] = useState(() => new Set(people.map((person) => person.userId)));
  const valid = label.trim().length >= 3 && passingScore >= 0 && passingScore <= 10 && selected.size > 0;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 md:p-6" role="dialog" aria-modal="true">
      <form
        className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && !busy) onSubmit({ label: label.trim(), passingScore, employeeIds: [...selected] });
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
          <fieldset>
            <div className="flex items-center justify-between gap-3">
              <legend className="text-[11px] font-black uppercase tracking-wider text-slate-500">Employees</legend>
              <button type="button" onClick={() => setSelected(selected.size === people.length ? new Set() : new Set(people.map((person) => person.userId)))} className="text-[11px] font-black text-indigo-600">
                {selected.size === people.length ? 'Clear all' : 'Select all'}
              </button>
            </div>
            <div className="mt-2 max-h-52 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
              {people.map((person) => (
                <label key={person.userId} className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-slate-50 cursor-pointer">
                  <input type="checkbox" checked={selected.has(person.userId)} onChange={() => setSelected((current) => {
                    const next = new Set(current);
                    if (next.has(person.userId)) next.delete(person.userId); else next.add(person.userId);
                    return next;
                  })} className="accent-indigo-600" />
                  <span className="min-w-0">
                    <span className="block text-xs font-black text-slate-800 truncate">{person.name}</span>
                    <span className="block text-[10px] font-semibold text-slate-400 truncate">{person.email}</span>
                  </span>
                </label>
              ))}
              {people.length === 0 && <p className="p-4 text-xs text-slate-500">No active employees are available.</p>}
            </div>
          </fieldset>
          <label className="block">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">Passing score (out of 10)</span>
            <input type="number" min={0} max={10} value={passingScore} onChange={(e) => setPassingScore(Number(e.target.value))} className={`${inputCls} mt-1.5`} />
          </label>
        </div>

        <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs font-semibold text-amber-800 leading-relaxed">
          Opening this cycle emails an invitation to <strong>{selected.size}</strong> selected {selected.size === 1 ? 'employee' : 'employees'} straight away.
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

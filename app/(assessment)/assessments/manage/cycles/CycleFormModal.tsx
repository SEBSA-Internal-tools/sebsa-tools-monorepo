'use client';

import React, { useState } from 'react';
import { Loader2, Send, X } from 'lucide-react';

interface CycleFormModalProps {
  recipientCount: number;
  busy: boolean;
  error: string | null;
  onSubmit: (input: { label: string; passingScore: number }) => void;
  onClose: () => void;
}

const inputCls =
  'w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400';

/** Collects a label and pass mark, and spells out that submitting emails every account. */
export default function CycleFormModal({ recipientCount, busy, error, onSubmit, onClose }: CycleFormModalProps) {
  const [label, setLabel] = useState('');
  const [passingScore, setPassingScore] = useState(8);
  const valid = label.trim().length >= 3 && passingScore >= 0 && passingScore <= 10;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 md:p-6" role="dialog" aria-modal="true">
      <form
        className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && !busy) onSubmit({ label: label.trim(), passingScore });
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
          <label className="block">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">Passing score (out of 10)</span>
            <input type="number" min={0} max={10} value={passingScore} onChange={(e) => setPassingScore(Number(e.target.value))} className={`${inputCls} mt-1.5`} />
          </label>
        </div>

        <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs font-semibold text-amber-800 leading-relaxed">
          Opening this cycle emails an invitation to <strong>{recipientCount}</strong> {recipientCount === 1 ? 'account' : 'accounts'} straight away.
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

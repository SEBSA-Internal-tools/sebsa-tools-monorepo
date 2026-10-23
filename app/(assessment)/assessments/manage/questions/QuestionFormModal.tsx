'use client';

import React, { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import type { ManagedQuestion } from '@/services/assessment-admin-service';

type Draft = Omit<ManagedQuestion, 'id'>;

interface QuestionFormModalProps {
  /** Present when editing; absent when adding. */
  question?: ManagedQuestion;
  busy: boolean;
  error: string | null;
  onSubmit: (draft: Draft) => void;
  onClose: () => void;
}

const inputCls =
  'w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400';
const labelCls = 'text-[11px] font-black uppercase tracking-wider text-slate-500';
const OPTION_KEYS = ['a', 'b', 'c', 'd'] as const;

export default function QuestionFormModal({ question, busy, error, onSubmit, onClose }: QuestionFormModalProps) {
  const [draft, setDraft] = useState<Draft>({
    questionText: question?.questionText ?? '',
    optionA: question?.optionA ?? '',
    optionB: question?.optionB ?? '',
    optionC: question?.optionC ?? '',
    optionD: question?.optionD ?? '',
    correctOption: question?.correctOption ?? 'a',
    category: question?.category ?? '',
    status: question?.status ?? 'active',
  });

  const optionField = { a: 'optionA', b: 'optionB', c: 'optionC', d: 'optionD' } as const;
  const valid =
    draft.questionText.trim().length >= 5 && OPTION_KEYS.every((k) => draft[optionField[k]].trim().length > 0);

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 md:p-6" role="dialog" aria-modal="true">
      <form
        className="w-full max-w-xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-xl p-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && !busy) onSubmit(draft);
        }}
      >
        <div className="flex items-start justify-between">
          <h3 className="text-lg font-black tracking-tight text-slate-900">{question ? 'Edit question' : 'Add question'}</h3>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <label className="block">
            <span className={labelCls}>Question</span>
            <textarea value={draft.questionText} onChange={(e) => setDraft({ ...draft, questionText: e.target.value })} rows={3} className={`${inputCls} mt-1.5 resize-y`} autoFocus />
          </label>

          <fieldset>
            <legend className={labelCls}>Options (select the correct one)</legend>
            <div className="mt-1.5 space-y-2">
              {OPTION_KEYS.map((k) => (
                <div key={k} className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="correct"
                    checked={draft.correctOption === k}
                    onChange={() => setDraft({ ...draft, correctOption: k })}
                    aria-label={`Option ${k.toUpperCase()} is correct`}
                    className="w-4 h-4 text-indigo-600 focus:ring-indigo-500/20 cursor-pointer shrink-0"
                  />
                  <span className="w-5 text-xs font-black uppercase text-slate-400">{k}</span>
                  <input
                    value={draft[optionField[k]]}
                    onChange={(e) => setDraft({ ...draft, [optionField[k]]: e.target.value })}
                    aria-label={`Option ${k.toUpperCase()}`}
                    className={inputCls}
                  />
                </div>
              ))}
            </div>
          </fieldset>

          <label className="block">
            <span className={labelCls}>Status</span>
            <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as Draft['status'] })} className={`${inputCls} mt-1.5`}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
        </div>

        {error && <p role="alert" className="mt-4 text-xs font-semibold text-rose-600">{error}</p>}

        <div className="flex justify-end gap-2 mt-6">
          <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl text-xs hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer">
            Cancel
          </button>
          <button type="submit" disabled={!valid || busy} className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-xs font-black rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer">
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {question ? 'Save changes' : 'Add question'}
          </button>
        </div>
      </form>
    </div>
  );
}

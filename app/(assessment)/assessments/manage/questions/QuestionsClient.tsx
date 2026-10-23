'use client';

import React, { useMemo, useState, useTransition } from 'react';
import { PageWrapper } from '@/app/components/PageWrapper';
import { QUESTIONS_PER_ATTEMPT } from '@/lib/assessment/rules';
import type { ManagedQuestion } from '@/services/assessment-admin-service';
import { createQuestionAction, deleteQuestionAction, updateQuestionAction } from '../actions';
import ConfirmDialog from '../ConfirmDialog';
import QuestionFormModal from './QuestionFormModal';
import { AlertTriangle, CheckCircle2, Pencil, Plus, Search, Trash2, XCircle } from 'lucide-react';

type StatusFilter = 'all' | 'active' | 'inactive';

export default function QuestionsClient({ initialQuestions }: { initialQuestions: ManagedQuestion[] }) {
  const [questions, setQuestions] = useState(initialQuestions);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [editing, setEditing] = useState<ManagedQuestion | 'new' | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ManagedQuestion | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const activeCount = questions.filter((q) => q.status === 'active').length;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return questions.filter(
      (item) =>
        (statusFilter === 'all' || item.status === statusFilter) &&
        (!q || item.questionText.toLowerCase().includes(q) || (item.category ?? '').toLowerCase().includes(q))
    );
  }, [questions, query, statusFilter]);

  const save = (draft: Omit<ManagedQuestion, 'id'>) => {
    setFormError(null);
    startTransition(async () => {
      const res = editing === 'new' || editing === null ? await createQuestionAction(draft) : await updateQuestionAction(editing.id, draft);
      if (res.status === 'error') {
        setFormError(res.message);
        return;
      }
      const saved = res.data;
      setQuestions((prev) => (prev.some((x) => x.id === saved.id) ? prev.map((x) => (x.id === saved.id ? saved : x)) : [...prev, saved]));
      setEditing(null);
      setMessage({ tone: 'ok', text: 'Question saved.' });
    });
  };

  const toggleStatus = (q: ManagedQuestion) => {
    const next = q.status === 'active' ? 'inactive' : 'active';
    startTransition(async () => {
      const res = await updateQuestionAction(q.id, { status: next });
      if (res.status === 'error') return setMessage({ tone: 'error', text: res.message });
      setQuestions((prev) => prev.map((x) => (x.id === q.id ? res.data : x)));
    });
  };

  const remove = () => {
    if (!deleting) return;
    const target = deleting;
    startTransition(async () => {
      const res = await deleteQuestionAction(target.id);
      setDeleting(null);
      if (res.status === 'error') return setMessage({ tone: 'error', text: res.message });
      setQuestions((prev) => prev.filter((x) => x.id !== target.id));
      setMessage({ tone: 'ok', text: 'Question deleted.' });
    });
  };

  return (
    <PageWrapper className="p-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-slate-900 font-sans leading-none">Question Bank</h2>
          <p className="text-sm font-medium text-slate-500 mt-2">
            {activeCount} active of {questions.length}. Each person is asked {QUESTIONS_PER_ATTEMPT} random active questions.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setFormError(null); setEditing('new'); }}
          className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white font-sans text-xs font-black uppercase tracking-wider rounded-full shadow-lg shadow-indigo-600/10 hover:bg-indigo-700 transition-all active:scale-95 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />Add question
        </button>
      </div>

      {activeCount < QUESTIONS_PER_ATTEMPT && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-semibold text-amber-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          At least {QUESTIONS_PER_ATTEMPT} active questions are needed before anyone can start an assessment.
        </div>
      )}

      {message && (
        <div role="status" className={`mb-5 flex items-start gap-3 rounded-2xl border p-4 text-xs font-semibold ${message.tone === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
          {message.tone === 'ok' ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <XCircle className="w-4 h-4 mt-0.5 shrink-0" />}
          {message.text}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm">
        <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex gap-1.5">
            {(['all', 'active', 'inactive'] as const).map((f) => (
              <button key={f} type="button" onClick={() => setStatusFilter(f)} className={`px-3 py-1.5 rounded-full text-[11px] font-black capitalize transition-colors cursor-pointer ${statusFilter === f ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {f}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search questions" aria-label="Search questions" className="bg-slate-100/90 border border-slate-200/50 rounded-full py-2 pl-10 pr-4 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-500/10 placeholder:text-slate-400" />
          </div>
        </div>

        <ul>
          {shown.map((q) => (
            <li key={q.id} className="p-5 border-b border-slate-50 last:border-b-0 hover:bg-slate-50/60">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800 leading-snug">{q.questionText}</p>
                  <ul className="mt-2.5 grid sm:grid-cols-2 gap-1.5">
                    {(['a', 'b', 'c', 'd'] as const).map((k) => {
                      const text = { a: q.optionA, b: q.optionB, c: q.optionC, d: q.optionD }[k];
                      const correct = q.correctOption === k;
                      return (
                        <li key={k} className={`text-xs rounded-lg px-3 py-1.5 border ${correct ? 'bg-emerald-50 border-emerald-200 text-emerald-800 font-semibold' : 'bg-slate-50/50 border-slate-100 text-slate-600'}`}>
                          <span className="font-black uppercase mr-1.5">{k}.</span>{text}
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => toggleStatus(q)}
                    disabled={isPending}
                    aria-label={`Set question ${q.status === 'active' ? 'inactive' : 'active'}`}
                    className={`px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50 ${q.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100' : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'}`}
                  >
                    {q.status}
                  </button>
                  <button type="button" onClick={() => { setFormError(null); setEditing(q); }} aria-label="Edit question" className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => setDeleting(q)} aria-label="Delete question" className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </li>
          ))}
          {shown.length === 0 && <li className="px-5 py-12 text-center text-xs text-slate-400">No questions match.</li>}
        </ul>
      </div>

      {editing && (
        <QuestionFormModal
          key={editing === 'new' ? 'new' : editing.id}
          question={editing === 'new' ? undefined : editing}
          busy={isPending}
          error={formError}
          onSubmit={save}
          onClose={() => setEditing(null)}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="Delete this question?"
        description="This cannot be undone. A question used in past attempts cannot be deleted. Set it to inactive instead."
        confirmLabel="Delete"
        destructive
        busy={isPending}
        onConfirm={remove}
        onCancel={() => setDeleting(null)}
      />
    </PageWrapper>
  );
}

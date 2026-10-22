'use client';

import React, { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageWrapper } from '@/app/components/PageWrapper';
import { submitAssessmentAction } from '../actions';
import { TIME_LIMIT_MINUTES } from '@/lib/assessment/rules';
import type { AnswerOption, AssessmentResult, AssessmentSession } from '@/types/assessment';
import AssessmentStatusCard from './AssessmentStatusCard';
import AssessmentResultView from './AssessmentResultView';
import { AlertTriangle, ArrowLeft, ArrowRight, Clock, Loader2, RotateCcw, Send } from 'lucide-react';

const formatElapsed = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

export default function TakeAssessmentClient({ session }: { session: AssessmentSession }) {
  if (session.kind === 'completed') {
    return <AssessmentResultView result={session.result} firstAttemptScore={session.firstAttemptScore} />;
  }
  if (session.kind !== 'ready') return <AssessmentStatusCard session={session} />;
  return <QuestionFlow session={session} />;
}

function QuestionFlow({ session }: { session: Extract<AssessmentSession, { kind: 'ready' }> }) {
  const router = useRouter();
  const { cycle, questions, attemptNumber, firstAttemptScore } = session;

  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerOption>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const [elapsed, setElapsed] = useState(0);

  // Elapsed time is informational only: the server does not enforce a limit.
  useEffect(() => {
    if (result) return;
    const timer = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [result]);

  if (result) {
    return result.isFinal ? (
      <AssessmentResultView result={result} firstAttemptScore={firstAttemptScore ?? undefined} />
    ) : (
      <RetryPanel score={result.score} total={result.total} onRetry={() => router.refresh()} />
    );
  }

  const question = questions[index];
  const answeredCount = Object.keys(answers).length;
  const unanswered = questions.length - answeredCount;
  const isLast = index === questions.length - 1;

  const submit = () => {
    setConfirmOpen(false);
    setError(null);
    startTransition(async () => {
      const outcome = await submitAssessmentAction({ cycleId: cycle.id, answers });
      if ('result' in outcome) setResult(outcome.result);
      else setError(outcome.message);
    });
  };

  return (
    <PageWrapper className="p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-end justify-between gap-4 mb-6">
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest text-indigo-600">
              {cycle.label} · Attempt {attemptNumber} of 2
            </p>
            <h2 className="text-3xl font-black tracking-tight text-slate-900 leading-none mt-2">Knowledge Assessment</h2>
          </div>
          <div className="flex items-center gap-2 px-3.5 py-2 bg-white rounded-xl border border-slate-200/80 shadow-sm text-xs font-black text-slate-700 tabular-nums">
            <Clock className="w-3.5 h-3.5 text-slate-400" />{formatElapsed(elapsed)}
            <span className="text-slate-400 font-semibold">/ {TIME_LIMIT_MINUTES}:00</span>
          </div>
        </div>

        {attemptNumber === 2 && firstAttemptScore != null && (
          <div className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-semibold text-amber-800">
            <RotateCcw className="w-4 h-4 mt-0.5 shrink-0" />
            You scored {firstAttemptScore}/{questions.length} on your first attempt. This is your final attempt, using the same questions.
          </div>
        )}

        {/* Progress */}
        <div className="mb-5">
          <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-slate-500 mb-2">
            <span>Question {index + 1} of {questions.length}</span>
            <span>{answeredCount} answered</span>
          </div>
          <div className="h-2 rounded-full bg-slate-200/70 overflow-hidden">
            <div className="h-full bg-indigo-600 transition-all duration-300" style={{ width: `${(answeredCount / questions.length) * 100}%` }} />
          </div>
          <div className="flex gap-1.5 mt-3 flex-wrap">
            {questions.map((q, i) => (
              <button
                key={q.id}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Go to question ${i + 1}${answers[q.id] ? ' (answered)' : ''}`}
                className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  i === index
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : answers[q.id]
                      ? 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                      : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-7">
          {question.category && (
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">{question.category}</p>
          )}
          <p className="text-base font-bold text-slate-900 leading-relaxed">{question.questionText}</p>

          <div role="radiogroup" aria-label="Answer options" className="mt-6 space-y-2.5">
            {question.options.map((option) => {
              const selected = answers[question.id] === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setAnswers((prev) => ({ ...prev, [question.id]: option.key }))}
                  className={`w-full flex items-start gap-3 text-left rounded-xl border px-4 py-3.5 text-sm font-medium transition-all cursor-pointer ${
                    selected
                      ? 'border-indigo-500 bg-indigo-50/60 text-indigo-900 ring-2 ring-indigo-500/10'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  <span
                    className={`w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-black uppercase shrink-0 ${
                      selected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {option.key}
                  </span>
                  <span className="leading-relaxed pt-0.5">{option.text}</span>
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <div role="alert" className="mt-5 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-700">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              {error}{' '}
              <Link href="/assessments" className="underline font-black">Back to My Assessment</Link>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mt-6">
          <button
            type="button"
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index === 0 || isPending}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl text-xs hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />Previous
          </button>

          {isLast ? (
            <button
              type="button"
              onClick={() => (unanswered > 0 ? setConfirmOpen(true) : submit())}
              disabled={isPending}
              className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white text-xs font-black uppercase tracking-wider rounded-full shadow-lg shadow-indigo-600/10 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 cursor-pointer"
            >
              {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {isPending ? 'Submitting…' : 'Submit assessment'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 text-white font-bold rounded-xl text-xs hover:bg-slate-900 transition-colors cursor-pointer shadow-sm"
            >
              Next<ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 md:p-6" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
            <h3 className="text-lg font-black tracking-tight text-slate-900">Submit with unanswered questions?</h3>
            <p className="text-xs font-medium text-slate-500 mt-2 leading-relaxed">
              You have {unanswered} unanswered {unanswered === 1 ? 'question' : 'questions'}. Unanswered questions score zero and
              you cannot change your answers after submitting.
            </p>
            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl text-xs hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Keep answering
              </button>
              <button
                type="button"
                onClick={submit}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black transition-all cursor-pointer"
              >
                Submit anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}

function RetryPanel({ score, total, onRetry }: { score: number; total: number; onRetry: () => void }) {
  return (
    <PageWrapper className="p-8 flex items-start justify-center">
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200/80 shadow-sm p-8 text-center mt-10">
        <div className="mx-auto mb-5 w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
          <RotateCcw className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-black tracking-tight text-slate-900">One more attempt available</h2>
        <p className="text-4xl font-black text-slate-900 mt-4">
          {score}<span className="text-xl text-slate-400">/{total}</span>
        </p>
        <p className="text-xs font-medium text-slate-500 mt-3 leading-relaxed">
          You can try once more using the <strong>same questions</strong>. Take your time to review before starting.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={onRetry}
            className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white text-xs font-black uppercase tracking-wider rounded-full shadow-lg shadow-indigo-600/10 hover:bg-indigo-700 transition-all active:scale-95 cursor-pointer"
          >
            Start second attempt<ArrowRight className="w-3.5 h-3.5" />
          </button>
          <Link href="/assessments" className="text-[11px] font-black text-indigo-600 hover:text-indigo-700 uppercase tracking-wide">
            Later
          </Link>
        </div>
      </div>
    </PageWrapper>
  );
}

'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { PageWrapper } from '@/app/components/PageWrapper';
import type { AssessmentResult } from '@/types/assessment';
import { Award, CheckCircle2, ChevronDown, Download, XCircle } from 'lucide-react';

interface Props {
  result: AssessmentResult;
  /** Set when this is the second attempt, to show the improvement. */
  firstAttemptScore?: number | null;
}

export default function AssessmentResultView({ result, firstAttemptScore }: Props) {
  const [showReview, setShowReview] = useState(false);
  const { passed } = result;

  return (
    <PageWrapper className="p-8">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-8 text-center">
          <div
            className={`mx-auto mb-5 w-16 h-16 rounded-2xl flex items-center justify-center ${
              passed ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500'
            }`}
          >
            {passed ? <CheckCircle2 className="w-8 h-8" /> : <XCircle className="w-8 h-8" />}
          </div>
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">{result.cycleLabel}</p>
          <h2 className="text-3xl font-black tracking-tight text-slate-900 mt-1">
            {passed ? 'Congratulations, you passed' : 'Assessment completed'}
          </h2>
          <p className="text-5xl font-black tracking-tight text-slate-900 mt-5">
            {result.score}<span className="text-2xl text-slate-400">/{result.total}</span>
          </p>
          <p className="text-xs font-semibold text-slate-500 mt-2">
            {result.percentage}% · pass mark {result.passingScore}/{result.total}
            {firstAttemptScore != null && ` · first attempt ${firstAttemptScore}/${result.total}`}
          </p>

          <div className="mt-7 flex items-center justify-center gap-3 flex-wrap">
            {result.certificateNumber && (
              <a
                href={`/api/assessments/certificates/${encodeURIComponent(result.certificateNumber)}`}
                download
                className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white text-xs font-black uppercase tracking-wider rounded-full shadow-lg shadow-indigo-600/10 hover:bg-indigo-700 transition-all active:scale-95"
              >
                <Download className="w-3.5 h-3.5" />Download certificate
              </a>
            )}
            <button
              type="button"
              onClick={() => setShowReview((v) => !v)}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 text-white font-bold rounded-xl text-xs hover:bg-slate-900 transition-colors cursor-pointer shadow-sm"
            >
              {showReview ? 'Hide review' : 'Review answers'}
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showReview ? 'rotate-180' : ''}`} />
            </button>
            <Link href="/assessments" className="text-[11px] font-black text-indigo-600 hover:text-indigo-700 uppercase tracking-wide">
              Back to My Assessment
            </Link>
          </div>

          {result.certificateNumber && (
            <p className="flex items-center justify-center gap-1.5 mt-5 text-[11px] font-semibold text-slate-400">
              <Award className="w-3.5 h-3.5" />A copy of your certificate was also emailed to you.
            </p>
          )}
        </div>

        {showReview && (
          <div className="mt-6 space-y-3">
            {result.perQuestion.map((q, i) => (
              <div key={q.id} className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5">
                <div className="flex items-start gap-3">
                  <span
                    className={`w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-xs shrink-0 ${
                      q.isCorrect ? 'bg-emerald-500' : 'bg-rose-500'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <p className="text-sm font-bold text-slate-800 leading-snug">{q.questionText}</p>
                </div>
                <ul className="mt-3 space-y-1.5 pl-10">
                  {q.options.map((o) => {
                    const isCorrect = o.key === q.correctKey;
                    const isChosenWrong = o.key === q.userKey && !isCorrect;
                    return (
                      <li
                        key={o.key}
                        className={`text-xs font-medium rounded-lg px-3 py-2 border ${
                          isCorrect
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                            : isChosenWrong
                              ? 'bg-rose-50 border-rose-200 text-rose-800'
                              : 'bg-slate-50/50 border-slate-100 text-slate-600'
                        }`}
                      >
                        <span className="font-black uppercase mr-2">{o.key}.</span>{o.text}
                        {isCorrect && <span className="ml-2 font-black">✓ Correct</span>}
                        {isChosenWrong && <span className="ml-2 font-black">Your answer</span>}
                      </li>
                    );
                  })}
                </ul>
                {q.userKey === null && <p className="pl-10 mt-2 text-[11px] font-semibold text-amber-600">Not answered</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </PageWrapper>
  );
}

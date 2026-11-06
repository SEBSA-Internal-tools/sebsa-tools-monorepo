'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { PageWrapper } from '@/app/components/PageWrapper';
import type { AssessmentOverview } from '@/types/assessment';
import { ArrowRight, CalendarClock, CheckCircle2, ClipboardList, Inbox, Award } from 'lucide-react';

interface Props {
  overview: AssessmentOverview;
  firstName: string;
}

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function AssessmentsOverviewClient({ overview, firstName }: Props) {
  const { activeCycle, currentAttempt, canRetry, pendingAssessment, completedAssessmentCount, certificateCount } = overview;
  const invitation = activeCycle?.invitation ?? null;

  // Re-evaluated on the client so an invitation that lapses while the page is open flips state.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!invitation || invitation.status === 'completed') return;
    const ms = new Date(invitation.expiresAt).getTime() - Date.now();
    if (ms <= 0) return;
    const timer = window.setTimeout(() => setNow(Date.now()), Math.min(ms + 1, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [invitation]);

  const expired = !!invitation && invitation.status !== 'completed' && new Date(invitation.expiresAt).getTime() < now;
  const finalised = !!currentAttempt?.isFinal;
  const eligible = !!activeCycle && !!invitation && !expired;
  const actionable = eligible && (pendingAssessment || canRetry) && !finalised;

  const statusLabel = finalised
    ? currentAttempt!.passed ? 'Passed' : 'Completed'
    : expired ? 'Invitation expired'
    : !actionable ? 'Unavailable'
    : canRetry ? 'Retry available' : 'Ready to start';

  const description = finalised
    ? `Your final score is ${currentAttempt!.score}/10. ${currentAttempt!.passed ? 'You met the passing criteria.' : 'The passing criteria were not met.'}`
    : expired ? 'This invitation has expired. Contact HR for a new invitation.'
    : !eligible ? 'No valid invitation is available. Contact HR for assistance.'
    : canRetry && currentAttempt ? `You scored ${currentAttempt.score}/10 on your first attempt. One second attempt is available with the same questions.`
    : 'Your assessment is ready. Open it to review the instructions and begin.';

  const kpis = [
    { title: 'Pending assessments', value: actionable ? 1 : 0, icon: ClipboardList, gradient: 'from-purple-800 via-violet-900 to-slate-950', iconColor: 'text-purple-200', labelColor: 'text-violet-200' },
    { title: 'Completed assessments', value: completedAssessmentCount, icon: CheckCircle2, gradient: 'from-indigo-900 to-slate-950', iconColor: 'text-sky-300', labelColor: 'text-indigo-300' },
    { title: 'Certificates earned', value: certificateCount, icon: Award, gradient: 'from-slate-800 to-slate-950', iconColor: 'text-amber-300', labelColor: 'text-slate-300' },
  ];

  return (
    <PageWrapper className="p-8">
      <div className="mb-8">
        <h2 className="text-3xl font-black tracking-tight text-slate-900 font-sans leading-none">My Assessment</h2>
        <p className="text-sm font-medium text-slate-500 mt-2">
          Welcome back{firstName ? `, ${firstName}` : ''}. Your assessments and certificates, all in one place.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.title} className={`bg-gradient-to-br ${kpi.gradient} text-white p-5 rounded-2xl shadow-xl border border-slate-800`}>
              <div className="p-3 bg-white/10 rounded-xl w-fit mb-4">
                <Icon className={`w-5 h-5 ${kpi.iconColor}`} />
              </div>
              <p className={`text-xs font-bold ${kpi.labelColor} uppercase tracking-widest mb-1.5`}>{kpi.title}</p>
              <h3 className="text-3xl font-black text-white tracking-tight font-sans">{kpi.value}</h3>
            </div>
          );
        })}
      </div>

      <div>
        <section className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="mb-6 pb-4 border-b border-slate-100">
            <h4 className="text-sm font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-indigo-600" />Your assessment
            </h4>
          </div>

          {!activeCycle || (!invitation && !currentAttempt) ? (
            <div className="flex items-start gap-4">
              <div className="p-3 bg-slate-100 rounded-xl text-slate-400"><Inbox className="w-5 h-5" /></div>
              <div>
                <p className="text-sm font-black text-slate-800">No assessments available</p>
                <p className="text-xs font-medium text-slate-500 mt-1.5 leading-relaxed">
                  Your assigned assessment will appear here when an invitation is available. Check your email for updates from HR.
                </p>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-3 flex-wrap mb-2">
                <h3 className="text-lg font-black text-slate-900">{activeCycle.label}</h3>
                <span className="px-2.5 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-[10px] font-black uppercase tracking-wider text-indigo-700">
                  {statusLabel}
                </span>
              </div>
              <p className="text-xs font-medium text-slate-500 leading-relaxed">{description}</p>

              {invitation && !finalised && (
                <p className="flex items-center gap-2 mt-4 text-[11px] font-semibold text-slate-500">
                  <CalendarClock className="w-3.5 h-3.5" />
                  Invitation {expired ? 'expired' : 'expires'}{' '}
                  <time dateTime={invitation.expiresAt} suppressHydrationWarning>{formatDateTime(invitation.expiresAt)}</time>
                </p>
              )}

              {(actionable || (eligible && finalised)) && (
                <Link
                  href="/assessments/take"
                  className="mt-6 inline-flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white text-xs font-black uppercase tracking-wider rounded-full shadow-lg shadow-indigo-600/10 hover:bg-indigo-700 transition-all active:scale-95"
                >
                  {finalised ? 'View result' : canRetry ? 'Start second attempt' : 'Start assessment'}
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>
          )}
        </section>
      </div>
    </PageWrapper>
  );
}

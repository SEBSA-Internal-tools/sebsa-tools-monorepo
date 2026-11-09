import React from 'react';
import Link from 'next/link';
import { PageWrapper } from '@/app/components/PageWrapper';
import { ArrowLeft, Inbox, Lock, MailX, DatabaseZap } from 'lucide-react';
import type { AssessmentSession } from '@/types/assessment';

type BlockedSession = Extract<AssessmentSession, { kind: 'no-cycle' | 'not-invited' | 'expired' | 'no-questions' }>;

const COPY = {
  'no-cycle': {
    icon: Inbox,
    title: 'No active assessment',
    text: 'There is no assessment open at the moment. Please check back later or contact HR.',
  },
  'not-invited': {
    icon: MailX,
    title: 'You have not been invited',
    text: 'You have not been invited to the current assessment cycle. Please contact HR.',
  },
  expired: {
    icon: Lock,
    title: 'Invitation expired',
    text: 'Your assessment invitation has expired. Please contact HR to receive a new invitation.',
  },
  'no-questions': {
    icon: DatabaseZap,
    title: 'Assessment not ready',
    text: 'The question bank does not have enough active questions yet. Please contact HR.',
  },
} as const;

/** Terminal "you can't take the assessment right now" states. */
export default function AssessmentStatusCard({ session }: { session: BlockedSession }) {
  const { icon: Icon, title, text } = COPY[session.kind];
  const detail =
    session.kind === 'expired'
      ? `Expired on ${new Date(session.expiredAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.`
      : null;

  return (
    <PageWrapper className="p-8 flex items-start justify-center">
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200/80 shadow-sm p-8 text-center mt-10">
        <div className="mx-auto mb-5 w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-500">
          <Icon className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-black tracking-tight text-slate-900">{title}</h2>
        <p className="text-xs font-medium text-slate-500 mt-2 leading-relaxed">{text}</p>
        {detail && <p className="text-[11px] font-semibold text-slate-400 mt-2" suppressHydrationWarning>{detail}</p>}
        <Link
          href="/assessments"
          className="mt-6 inline-flex items-center gap-2 px-6 py-2.5 bg-slate-800 text-white text-xs font-black rounded-xl hover:bg-slate-900 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />Back to My Assessment
        </Link>
      </div>
    </PageWrapper>
  );
}

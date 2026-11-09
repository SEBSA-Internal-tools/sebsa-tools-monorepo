import React from 'react';
import { redirect } from 'next/navigation';
import { Sidebar } from '@/app/components/Sidebar';
import { Header } from '@/app/components/Header';
import { getCurrentUser, isReviewerOrAbove } from '@/lib/auth';
import { getPendingApprovalCountAction } from '@/app/(authenticated)/review/actions';

/**
 * Shell for the assessments module. Same chrome as app/(authenticated)/layout.tsx, deliberately
 * WITHOUT its "employee with no CV profile -> /onboarding" redirect: everyone takes the
 * assessment, including people who have never created a CV profile.
 */
export default async function AssessmentsLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const pendingApprovalCount = isReviewerOrAbove(user.role)
    ? await getPendingApprovalCountAction()
    : 0;

  return (
    <div className="min-h-screen bg-[#fbf9fb] text-[#1b1b1d] font-sans">
      <Sidebar user={user} pendingApprovalCount={pendingApprovalCount} />
      <div className="pl-[260px] min-h-screen flex flex-col">
        <Header user={user} hideSearch />
        <main className="flex-1 pt-16">{children}</main>
      </div>
    </div>
  );
}

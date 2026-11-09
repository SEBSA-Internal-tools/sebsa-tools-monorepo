import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser, canManageAssessments } from '@/lib/auth';

// Sending a cycle emails every account; leave room for it on hosts that cap server-action time.
export const maxDuration = 60;

/**
 * Gate for the HR / assessment-admin screens. This is the first line of defence only: every
 * server action re-checks the role, and the assessment_* RLS policies refuse the data to anyone
 * outside the HR tier (HR, Super Admin) regardless of what the UI shows.
 */
export default async function ManageAssessmentsLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!canManageAssessments(user.role)) redirect('/assessments');
  return <>{children}</>;
}

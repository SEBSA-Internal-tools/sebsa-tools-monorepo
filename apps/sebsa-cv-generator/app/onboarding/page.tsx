import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getDepartmentsAction } from '../(authenticated)/upload/actions';
import { findClaimableProfileAction, findPendingClaimAction } from './actions';
import OnboardingClient from './OnboardingClient';

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  // Only self-service employees land here; everyone else (and anyone who already has a linked
  // profile) belongs in the main app.
  if (user.role !== 'employee' || user.hasLinkedProfile) redirect('/dashboard');

  const [departments, claimableProfile, pendingClaim] = await Promise.all([
    getDepartmentsAction(),
    findClaimableProfileAction(),
    findPendingClaimAction(),
  ]);

  return (
    <OnboardingClient
      userEmail={user.email}
      departments={departments}
      claimableProfile={claimableProfile}
      pendingClaim={pendingClaim}
    />
  );
}

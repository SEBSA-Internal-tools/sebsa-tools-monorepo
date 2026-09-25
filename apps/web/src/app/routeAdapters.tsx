import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ROUTES } from '@/config/routes.ts';
import { useSession } from '@/hooks/useSession.ts';
import { LoginPage } from '@/features/auth/routes/LoginPage.tsx';
import { HomePage } from '@/features/home/routes/HomePage.tsx';
import { useSessionUser } from './session.ts';
import { PageSkeleton } from '@/components/common/Skeleton.tsx';

/**
 * Thin adapters between the router and feature routes.
 *
 * They read the session resolved by `RootLayout` and hand it down as a plain
 * prop, which is what lets feature routes stay unaware of the auth feature —
 * required by the boundary rules, and it makes those routes trivial to render
 * in tests with a fabricated user.
 *
 * Kept out of `router.tsx` so that file exports only the router, which is what
 * Fast Refresh needs to reload routes without a full page reload.
 */

interface LocationState {
  from?: string;
}

export function LoginRoute() {
  const isAuthenticated = useSession((s) => s.isAuthenticated);
  const isChecking = useSession((s) => s.isChecking);
  const navigate = useNavigate();
  const location = useLocation();

  const from = (location.state as LocationState | null)?.from;

  if (isChecking) return <PageSkeleton className="min-h-screen" />;

  // Already signed in: skip the login screen entirely rather than letting
  // someone sign in twice.
  if (isAuthenticated) {
    return <Navigate to={from ?? ROUTES.home} replace />;
  }

  return (
    <LoginPage
      onSignedIn={() => {
        // `replace` so Back does not return to the login screen after signing in.
        void navigate(from ?? ROUTES.home, { replace: true });
      }}
    />
  );
}

export function HomeRoute() {
  return <HomePage user={useSessionUser()} />;
}

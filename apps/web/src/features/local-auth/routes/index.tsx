import { Navigate, type RouteObject } from 'react-router-dom';
import { isLocalAuthEnabled, LOCAL_AUTH_ROUTES } from '../config.ts';
import { ForgotPasswordPage } from './ForgotPasswordPage.tsx';
import { LinkExpiredPage } from './LinkExpiredPage.tsx';
import { SetPasswordPage } from './SetPasswordPage.tsx';

/**
 * Public routes for the temporary local-auth feature. Mounted by `routes/index.tsx`
 * outside `RequireAuth`, and empty unless `VITE_LOCAL_AUTH_ENABLED=true`.
 *
 * Accounts are created by admins now, so `/signup` is no longer a page: it goes
 * to sign-in whatever the switch says.
 */
export const localAuthRoutes: RouteObject[] = [
  { path: LOCAL_AUTH_ROUTES.signup, element: <Navigate to={LOCAL_AUTH_ROUTES.login} replace /> },
  ...(isLocalAuthEnabled
    ? [
        { path: LOCAL_AUTH_ROUTES.setPassword, element: <SetPasswordPage /> },
        { path: LOCAL_AUTH_ROUTES.forgotPassword, element: <ForgotPasswordPage /> },
        { path: LOCAL_AUTH_ROUTES.linkExpired, element: <LinkExpiredPage /> },
      ]
    : []),
];

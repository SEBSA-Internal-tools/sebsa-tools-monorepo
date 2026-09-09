import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom';
import { routePaths, SEGMENTS } from '@/constants/routePaths';
import { LoginRoute } from '@/app/routeAdapters';
import { RequireAuth } from '@/app/RequireAuth';
import { RootLayout } from '@/app/RootLayout';
import { RouteError } from '@/app/RouteError';
import { ScrollRestorationLayout } from '@/app/ScrollRestorationLayout';
import { codeReviewRoutes } from './codeReviewRoutes';
import { LegacyWorkspaceRedirect } from './LegacyWorkspaceRedirect';

export const routeTree: RouteObject[] = [
  {
    element: <ScrollRestorationLayout />,
    children: [
      { path: routePaths.login, element: <LoginRoute /> },
      { path: 'developer/*', element: <LegacyWorkspaceRedirect /> },
      { path: 'reviewer/*', element: <LegacyWorkspaceRedirect /> },
      { path: 'admin/*', element: <LegacyWorkspaceRedirect /> },
      {
        path: '/',
        element: (
          <RequireAuth>
            <RootLayout />
          </RequireAuth>
        ),
        // A thrown render error is not a missing page. Using NotFoundPage here made
        // every failure inside the authenticated tree read "We could not find that
        // page", hiding the real cause.
        errorElement: <RouteError />,
        children: [
          {
            index: true,
            element: <Navigate to={routePaths.crp.home} replace />,
          },
          { path: SEGMENTS.crp, children: codeReviewRoutes },
          {
            path: SEGMENTS.delivery,
            handle: { title: 'Delivery Portal' },
            lazy: async () => {
              const module = await import('@/portals/delivery/routes/DeliveryComingSoon');
              return { Component: module.DeliveryComingSoon };
            },
          },
          {
            path: SEGMENTS.wiki,
            handle: { title: 'Wiki' },
            lazy: async () => {
              const module = await import('@/portals/wiki/routes/WikiComingSoon');
              return { Component: module.WikiComingSoon };
            },
          },
          {
            path: '404',
            lazy: async () => {
              const module = await import('@/app/NotFoundPage');
              return { Component: module.NotFoundPage };
            },
          },
          { path: '*', element: <Navigate to="/404" replace /> },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routeTree);

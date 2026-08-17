import { QueryClient } from "@tanstack/react-query";

/**
 * Shared server-state cache.
 *
 * Retry policy is deliberate: a 4xx means the request itself was wrong, so
 * repeating it just delays the error the user needs to see. 5xx and network
 * blips are worth two attempts.
 *
 * `throwOnError` for 5xx lets the route ErrorBoundary render a real failure
 * state instead of every component inventing its own.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
});

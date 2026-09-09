/**
 * Compatibility shim for the folder shape named in the original brief
 * (`src/services/mockApiService.ts`).
 *
 * There is deliberately no mock service object here, and new code should import
 * `@/lib/apiClient.ts` directly.
 *
 * WHY THE MOCK LIVES ELSEWHERE
 * A hand-written mock service is a dead end: every component that imports it
 * has to be edited when the real backend arrives. Instead the application makes
 * real `fetch` calls to real URLs from day one, and MSW intercepts them at the
 * Service Worker level (`src/mocks/`). Phase 2 removes one `if (import.meta.env.DEV)`
 * block in `app/main.tsx` and nothing above this layer changes — see plan §2.2.
 *
 * That also means Phase 1 exercises genuine loading, error and latency
 * behaviour, which a synchronous mock object never would.
 */
export { api, ApiError, ApiContractError, setMockUserId } from '@/lib/apiClient.ts';

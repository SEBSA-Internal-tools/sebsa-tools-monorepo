/**
 * `@sdp/contracts` — the single source of truth for everything that crosses the
 * network.
 *
 * These Zod schemas are consumed from both directions: `lib/apiClient` validates
 * responses against them, and the MSW handlers validate requests against them.
 * Contract drift therefore fails loudly in development rather than shipping.
 *
 * This package must stay app-agnostic. UI-shaped view models belong in
 * `src/types`; form schemas with user-facing messages belong in the owning
 * feature's `domain/` folder, built by `.pick()`/`.extend()` from these.
 */

export * from "./primitives.ts";
export * from "./user.ts";
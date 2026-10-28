/**
 * Small in-memory sliding-window limiter for the public password-reset and signup endpoints.
 *
 * Why it exists: those endpoints send email on behalf of anyone who can reach them. Supabase's own
 * limits protect its built-in mailer; once the app sends the mail itself, nothing else stops a
 * script from mailing one person repeatedly or exhausting the shared mailbox's sending quota (which
 * would also stop invitations). Limits here are per server instance, so they are best-effort on a
 * serverless host; add a Vercel Firewall rate-limit rule for a hard guarantee (docs/graph-mail.md).
 */
export interface RateLimiterOptions {
  /** Maximum actions per key inside the window. */
  limit: number;
  windowMs: number;
  /** Injected clock for tests. */
  now?: () => number;
  /** Upper bound on tracked keys so an attacker cannot grow memory without limit. */
  maxKeys?: number;
}

export function createRateLimiter(options: RateLimiterOptions) {
  const { limit, windowMs } = options;
  const now = options.now ?? (() => Date.now());
  const maxKeys = options.maxKeys ?? 5000;
  const hits = new Map<string, number[]>();

  function prune(at: number) {
    const cutoff = at - windowMs;
    for (const [key, times] of hits) {
      if (times.length === 0 || times[times.length - 1] <= cutoff) hits.delete(key);
    }
    // Still too many distinct keys: drop the oldest-inserted ones.
    for (const key of hits.keys()) {
      if (hits.size <= maxKeys) break;
      hits.delete(key);
    }
  }

  return {
    /** True when the action may proceed (and is recorded); false when the key is over its limit. */
    allow(key: string): boolean {
      const at = now();
      const recent = (hits.get(key) ?? []).filter((t) => t > at - windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(at);
      hits.set(key, recent);
      if (hits.size > maxKeys) prune(at);
      return true;
    },
  };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;

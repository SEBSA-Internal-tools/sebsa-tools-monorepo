/**
 * Sends email through Microsoft Graph (`POST /users/{mailbox}/sendMail`) using the app-only
 * client-credentials flow. The mailbox must be covered by the app's Mail.Send permission AND by an
 * Exchange Application Access Policy, otherwise Graph answers 403 ErrorAccessDenied.
 *
 * Deliberately free of imports from the app (no `@/` aliases, no env access): configuration and
 * `fetch` are passed in, so the whole module is unit-testable and the secret never travels through
 * any logging path here. See docs/graph-mail.md.
 */

export interface GraphMailConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  /** The mailbox the message is sent AS, e.g. cv.generator@sebsaworld.com. */
  sender: string;
}

export interface GraphAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface GraphEmail {
  subject: string;
  html: string;
  attachments?: GraphAttachment[];
}

export interface GraphSendResult {
  ok: boolean;
  /** HTTP status of the last request made (token or sendMail). */
  status?: number;
  /** Graph / Entra error code (e.g. ErrorAccessDenied, invalid_client) or our own (e.g. invalid_recipient). */
  errorCode?: string;
  /** Safe, human-readable explanation. Never contains the client secret. */
  message?: string;
  /** Microsoft's request id, useful when asking IT/Microsoft to trace a failure. */
  requestId?: string;
  attempts: number;
}

export interface GraphMailDeps {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** Graph allows about 4 concurrent requests per mailbox; stay below that. */
  maxConcurrent?: number;
  maxAttempts?: number;
  /** Longest single wait we accept for a Retry-After. Longer than this and we give up rather than
   *  hang a serverless request. */
  maxRetryWaitMs?: number;
  timeoutMs?: number;
}

/** Inline fileAttachment limit in Graph is ~3 MB per file (larger needs an upload session). */
const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

/** One address, no whitespace/newlines/commas: blocks header-style injection into the recipient. */
const SIMPLE_ADDRESS = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;

export function createGraphMailer(config: GraphMailConfig, deps: GraphMailDeps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = deps.now ?? (() => Date.now());
  const maxConcurrent = deps.maxConcurrent ?? 3;
  const maxAttempts = deps.maxAttempts ?? 4;
  const maxRetryWaitMs = deps.maxRetryWaitMs ?? 10_000;
  const timeoutMs = deps.timeoutMs ?? 10_000;

  // ── token cache (shared by every send from this process) ──────────────────────────────────
  let cached: { token: string; expiresAt: number } | null = null;
  let inflight: Promise<{ token?: string; error?: GraphSendResult }> | null = null;

  async function timedFetch(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchImpl(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchToken(): Promise<{ token?: string; error?: GraphSendResult }> {
    const body = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    });
    let res: Response;
    try {
      res = await timedFetch(`https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
    } catch {
      return { error: { ok: false, errorCode: 'token_network_error', message: 'Could not reach Microsoft to get a token.', attempts: 0 } };
    }
    const json = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };
    if (!res.ok || !json.access_token) {
      return {
        error: {
          ok: false,
          status: res.status,
          errorCode: json.error ?? 'token_error',
          // error_description starts with the AADSTS code and never echoes the secret.
          message: (json.error_description ?? 'Microsoft refused to issue a token.').split('\r\n')[0].slice(0, 300),
          attempts: 0,
        },
      };
    }
    const lifetimeMs = (json.expires_in ?? 3600) * 1000;
    // Refresh a minute early so a token never expires mid-request.
    cached = { token: json.access_token, expiresAt: now() + lifetimeMs - 60_000 };
    return { token: json.access_token };
  }

  async function getToken(force = false): Promise<{ token?: string; error?: GraphSendResult }> {
    if (!force && cached && cached.expiresAt > now()) return { token: cached.token };
    if (force) cached = null;
    // Single flight: concurrent sends share one token request.
    inflight ??= fetchToken().finally(() => {
      inflight = null;
    });
    return inflight;
  }

  // ── tiny semaphore so a bulk send never exceeds Graph's per-mailbox concurrency ───────────
  let running = 0;
  const waiters: Array<() => void> = [];
  async function acquire() {
    if (running < maxConcurrent) {
      running++;
      return;
    }
    await new Promise<void>((resolve) => waiters.push(resolve));
  }
  function release() {
    const next = waiters.shift();
    if (next) next(); // hand the slot straight over
    else running--;
  }

  function retryDelayMs(res: Response | null, attempt: number): number {
    const header = res?.headers.get('retry-after');
    const seconds = header ? Number(header) : NaN;
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    return Math.min(1000 * 2 ** (attempt - 1), maxRetryWaitMs); // 1s, 2s, 4s...
  }

  function buildPayload(to: string, email: GraphEmail) {
    return {
      message: {
        subject: email.subject,
        body: { contentType: 'HTML', content: email.html },
        toRecipients: [{ emailAddress: { address: to } }],
        ...(email.attachments?.length
          ? {
              attachments: email.attachments.map((a) => ({
                '@odata.type': '#microsoft.graph.fileAttachment',
                name: a.filename,
                contentType: a.contentType,
                contentBytes: a.content.toString('base64'),
              })),
            }
          : {}),
      },
      saveToSentItems: true,
    };
  }

  async function send(to: string, email: GraphEmail): Promise<GraphSendResult> {
    if (!SIMPLE_ADDRESS.test(to)) {
      return { ok: false, errorCode: 'invalid_recipient', message: 'The recipient is not a single valid email address.', attempts: 0 };
    }
    if (!SIMPLE_ADDRESS.test(config.sender)) {
      return { ok: false, errorCode: 'invalid_sender', message: 'GRAPH_SENDER is not a valid email address.', attempts: 0 };
    }
    const totalBytes = (email.attachments ?? []).reduce((sum, a) => sum + a.content.length, 0);
    if ((email.attachments ?? []).some((a) => a.content.length > MAX_ATTACHMENT_BYTES) || totalBytes > MAX_ATTACHMENT_BYTES) {
      return { ok: false, errorCode: 'attachment_too_large', message: 'Attachments are over the 3 MB inline limit.', attempts: 0 };
    }

    await acquire();
    try {
      const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(config.sender)}/sendMail`;
      const body = JSON.stringify(buildPayload(to, email));
      let refreshedOn401 = false;
      let last: GraphSendResult = { ok: false, errorCode: 'unknown', attempts: 0 };

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const tokenResult = await getToken();
        if (!tokenResult.token) return { ...tokenResult.error!, attempts: attempt };

        let res: Response | null = null;
        try {
          res = await timedFetch(url, {
            method: 'POST',
            headers: { Authorization: `Bearer ${tokenResult.token}`, 'Content-Type': 'application/json' },
            body,
          });
        } catch {
          last = { ok: false, errorCode: 'network_error', message: 'Could not reach Microsoft Graph (network error or timeout).', attempts: attempt };
          if (attempt < maxAttempts) await sleep(retryDelayMs(null, attempt));
          continue;
        }

        const requestId = res.headers.get('request-id') ?? res.headers.get('client-request-id') ?? undefined;
        if (res.status === 202) return { ok: true, status: 202, requestId, attempts: attempt };

        const errJson = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
        last = {
          ok: false,
          status: res.status,
          errorCode: errJson.error?.code ?? `http_${res.status}`,
          message: (errJson.error?.message ?? res.statusText ?? 'Graph rejected the request.').slice(0, 300),
          requestId,
          attempts: attempt,
        };

        if (res.status === 401 && !refreshedOn401) {
          // Token revoked or rotated: get a fresh one once, then try again.
          refreshedOn401 = true;
          await getToken(true);
          continue;
        }
        if (!RETRYABLE_STATUS.has(res.status)) return last; // 400/403/404: retrying cannot help

        const wait = retryDelayMs(res, attempt);
        if (wait > maxRetryWaitMs) return last; // told to wait too long for a web request
        if (attempt < maxAttempts) await sleep(wait);
      }
      return last;
    } finally {
      release();
    }
  }

  return { send };
}

export type GraphMailer = ReturnType<typeof createGraphMailer>;

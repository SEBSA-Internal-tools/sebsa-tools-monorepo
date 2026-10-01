import { afterEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { z } from 'zod';
import { api, ApiError, setDetachedRecovery } from '@/lib/apiClient.ts';
import { server } from '@/test/mswServer.ts';

/**
 * When the browser stops the mock service worker, requests reach the dev server
 * instead: Vite answers an HTML 404, or its `/api` proxy a plain-text 502 when no
 * backend is listening. Either must trigger the one-shot re-attach and retry.
 */
const okSchema = z.object({ ok: z.boolean() });

/** First call answers like a bypassed request; every later call is the mock API again. */
function detachedOnce(status: number, contentType: string) {
  let calls = 0;
  server.use(
    http.get('/api/probe', () => {
      calls += 1;
      if (calls === 1)
        return new HttpResponse('detached', { status, headers: { 'Content-Type': contentType } });
      return HttpResponse.json({ ok: true });
    }),
  );
}

afterEach(() => {
  setDetachedRecovery(null);
});

describe('mock API detached recovery', () => {
  it.each([
    ['the dev proxy 502', 502, 'text/plain'],
    ['the dev server HTML 404', 404, 'text/html'],
  ])('re-attaches and retries once after %s', async (_label, status, contentType) => {
    const recover = vi.fn(() => Promise.resolve());
    setDetachedRecovery(recover);
    detachedOnce(status, contentType);

    await expect(api.get('/probe', okSchema)).resolves.toEqual({ ok: true });
    expect(recover).toHaveBeenCalledOnce();
  });

  it('treats a JSON 502 as a real API error, not a detached worker', async () => {
    const recover = vi.fn(() => Promise.resolve());
    setDetachedRecovery(recover);
    server.use(
      http.get('/api/probe', () =>
        HttpResponse.json(
          { statusCode: 502, code: 'BAD_GATEWAY', message: 'Upstream failed' },
          { status: 502 },
        ),
      ),
    );

    await expect(api.get('/probe', okSchema)).rejects.toBeInstanceOf(ApiError);
    expect(recover).not.toHaveBeenCalled();
  });
});

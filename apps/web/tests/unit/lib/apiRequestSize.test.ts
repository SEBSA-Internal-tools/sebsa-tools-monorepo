import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { api } from '@/lib/apiClient.ts';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('hosted API payload limit', () => {
  it('rejects oversized UTF-8 screenshot requests before sending them', async () => {
    vi.stubEnv('VITE_MAX_API_REQUEST_BYTES', '20');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(api.post('/tasks', z.unknown(), { text: '💻💻💻💻' })).rejects.toMatchObject({
      statusCode: 413,
      code: 'PAYLOAD_TOO_LARGE',
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('keeps small requests on the same origin and sends session cookies', async () => {
    vi.stubEnv('VITE_MAX_API_REQUEST_BYTES', '100');
    const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    await api.post('/tasks', z.unknown(), { title: 'Small task' });
    expect(fetch).toHaveBeenCalledWith(
      '/api/tasks',
      expect.objectContaining({ credentials: 'include', body: '{"title":"Small task"}' }),
    );
  });
});

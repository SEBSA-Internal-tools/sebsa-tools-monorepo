import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ app: vi.fn(), adapter: vi.fn(), wrap: vi.fn() }));
vi.mock('./application.js', () => ({ getNetlifyApplication: mocks.app }));
vi.mock('serverless-http', () => ({ default: mocks.wrap }));

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  mocks.app.mockResolvedValue({ getHttpAdapter: () => ({ getInstance: () => ({}) }) });
  mocks.adapter.mockResolvedValue({
    statusCode: 200,
    body: '{}',
    multiValueHeaders: { 'set-cookie': ['sdp_access=a', 'sdp_csrf=b'] },
  });
  mocks.wrap.mockReturnValue(mocks.adapter);
});

describe('Netlify API routing', () => {
  it('preserves rewritten API paths, query parameters and multiple cookies', async () => {
    const { handler } = await import('./api.js');
    const event = { path: '/api/health', queryStringParameters: { check: '1' } };
    const context: Record<string, unknown> = {};
    const result = await handler(event, context);
    expect(mocks.adapter).toHaveBeenCalledWith(event, context);
    expect(result['multiValueHeaders']).toEqual({ 'set-cookie': ['sdp_access=a', 'sdp_csrf=b'] });
    expect(result.headers['Cache-Control']).toBe('private, no-store');
    expect(context['callbackWaitsForEmptyEventLoop']).toBe(false);
    await handler(event, context);
    expect(mocks.app).toHaveBeenCalledTimes(1);
  });
  it('normalizes direct function URLs to the Nest API prefix', async () => {
    const { handler } = await import('./api.js');
    await handler({ path: '/.netlify/functions/api/auth/me' }, {});
    expect(mocks.adapter.mock.calls[0]?.[0]).toMatchObject({ path: '/api/auth/me' });
  });
  it('allows a cold start to retry after a failed initialization', async () => {
    mocks.app.mockRejectedValueOnce(new Error('database unavailable'));
    const { handler } = await import('./api.js');
    await expect(handler({ path: '/api/health' }, {})).rejects.toThrow('database unavailable');
    await expect(handler({ path: '/api/health' }, {})).resolves.toMatchObject({ statusCode: 200 });
    expect(mocks.app).toHaveBeenCalledTimes(2);
  });
});

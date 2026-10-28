const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

// Same approach as the other tests here: compile the TypeScript module with the project's compiler
// and inject its imports, so no network, credentials or Next.js runtime are needed.
function load(path, imports = {}) {
  const source = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', source)((id) => imports[id] ?? require(id), module, module.exports);
  return module.exports;
}

const { createGraphMailer } = load('lib/email/graphMail.ts');

const CONFIG = {
  tenantId: '088ce82f-bf1a-4ff3-a516-626b8524875b',
  clientId: '11084482-d34a-4a0e-a021-4c11e775ec52',
  clientSecret: 'TEST-SECRET-must-never-appear-anywhere',
  sender: 'cv.generator@sebsaworld.com',
};
const EMAIL = { subject: 'Hello', html: '<p>Hi</p>' };

/** A scripted fetch: each call takes the next response; records every request. */
function scriptedFetch(responses) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const next = responses.shift();
    if (!next) throw new Error('unexpected extra fetch to ' + url);
    if (next instanceof Error) throw next;
    return next;
  };
  fn.calls = calls;
  return fn;
}
const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const accepted = (headers = {}) => new Response(null, { status: 202, headers });
const tokenOk = (expires_in = 3600) => json(200, { access_token: 'tok-1', expires_in, token_type: 'Bearer' });

function mailer(responses, deps = {}) {
  const fetchImpl = scriptedFetch(responses);
  const sleeps = [];
  const m = createGraphMailer(CONFIG, { fetchImpl, sleep: async (ms) => { sleeps.push(ms); }, ...deps });
  return { m, fetchImpl, sleeps };
}

test('happy path: asks Entra for an app token, then posts sendMail as the shared mailbox', async () => {
  const { m, fetchImpl } = mailer([tokenOk(), accepted({ 'request-id': 'req-123' })]);
  const r = await m.send('person@sebsaworld.com', EMAIL);

  assert.equal(r.ok, true);
  assert.equal(r.status, 202);
  assert.equal(r.requestId, 'req-123');

  const [tokenCall, sendCall] = fetchImpl.calls;
  assert.equal(tokenCall.url, `https://login.microsoftonline.com/${CONFIG.tenantId}/oauth2/v2.0/token`);
  const form = new URLSearchParams(tokenCall.init.body.toString());
  assert.equal(form.get('grant_type'), 'client_credentials');
  assert.equal(form.get('scope'), 'https://graph.microsoft.com/.default');
  assert.equal(form.get('client_id'), CONFIG.clientId);

  assert.equal(sendCall.url, 'https://graph.microsoft.com/v1.0/users/cv.generator%40sebsaworld.com/sendMail');
  assert.equal(sendCall.init.method, 'POST');
  assert.equal(sendCall.init.headers.Authorization, 'Bearer tok-1');
  const payload = JSON.parse(sendCall.init.body);
  assert.equal(payload.saveToSentItems, true);
  assert.equal(payload.message.subject, 'Hello');
  assert.deepEqual(payload.message.body, { contentType: 'HTML', content: '<p>Hi</p>' });
  assert.deepEqual(payload.message.toRecipients, [{ emailAddress: { address: 'person@sebsaworld.com' } }]);
  assert.equal(payload.message.attachments, undefined);
});

test('token is cached across sends and refreshed after it expires', async () => {
  let clock = 1_000_000;
  const { m, fetchImpl } = mailer(
    [tokenOk(3600), accepted(), accepted(), tokenOk(3600), accepted()],
    { now: () => clock }
  );
  await m.send('a@sebsaworld.com', EMAIL);
  await m.send('b@sebsaworld.com', EMAIL);
  assert.equal(fetchImpl.calls.filter((c) => c.url.includes('/oauth2/')).length, 1, 'one token request for two sends');

  clock += 3600 * 1000; // an hour later
  await m.send('c@sebsaworld.com', EMAIL);
  assert.equal(fetchImpl.calls.filter((c) => c.url.includes('/oauth2/')).length, 2, 'a new token after expiry');
});

test('concurrent sends share a single token request', async () => {
  const { m, fetchImpl } = mailer([tokenOk(), accepted(), accepted(), accepted()]);
  await Promise.all(['a', 'b', 'c'].map((n) => m.send(`${n}@sebsaworld.com`, EMAIL)));
  assert.equal(fetchImpl.calls.filter((c) => c.url.includes('/oauth2/')).length, 1);
});

test('401 from Graph: refreshes the token once and retries', async () => {
  const { m, fetchImpl } = mailer([
    tokenOk(), json(401, { error: { code: 'InvalidAuthenticationToken', message: 'expired' } }),
    json(200, { access_token: 'tok-2', expires_in: 3600 }), accepted(),
  ]);
  const r = await m.send('a@sebsaworld.com', EMAIL);
  assert.equal(r.ok, true);
  assert.equal(r.attempts, 2);
  assert.equal(fetchImpl.calls.at(-1).init.headers.Authorization, 'Bearer tok-2');
});

test('429 with Retry-After: waits the requested time, then succeeds', async () => {
  const { m, sleeps } = mailer([
    tokenOk(), json(429, { error: { code: 'TooManyRequests', message: 'slow down' } }, { 'retry-after': '2' }), accepted(),
  ]);
  const r = await m.send('a@sebsaworld.com', EMAIL);
  assert.equal(r.ok, true);
  assert.equal(r.attempts, 2);
  assert.deepEqual(sleeps, [2000]);
});

test('429 telling us to wait longer than a web request can: gives up instead of hanging', async () => {
  const { m, sleeps } = mailer([
    tokenOk(), json(429, { error: { code: 'TooManyRequests', message: 'later' } }, { 'retry-after': '600' }),
  ]);
  const r = await m.send('a@sebsaworld.com', EMAIL);
  assert.equal(r.ok, false);
  assert.equal(r.status, 429);
  assert.deepEqual(sleeps, [], 'did not sleep for 10 minutes');
});

test('503 without Retry-After backs off exponentially, and stops after the attempt limit', async () => {
  const fail = () => json(503, { error: { code: 'ServiceUnavailable', message: 'down' } });
  const { m, sleeps, fetchImpl } = mailer([tokenOk(), fail(), fail(), fail(), fail()], { maxAttempts: 4 });
  const r = await m.send('a@sebsaworld.com', EMAIL);
  assert.equal(r.ok, false);
  assert.equal(r.attempts, 4);
  assert.deepEqual(sleeps, [1000, 2000, 4000]);
  assert.equal(fetchImpl.calls.filter((c) => c.url.includes('/sendMail')).length, 4);
});

test('403 ErrorAccessDenied (policy / permission): reports it clearly and does NOT retry', async () => {
  const { m, fetchImpl, sleeps } = mailer([
    tokenOk(), json(403, { error: { code: 'ErrorAccessDenied', message: 'Access is denied. Check credentials and try again.' } }, { 'request-id': 'req-9' }),
  ]);
  const r = await m.send('a@sebsaworld.com', EMAIL);
  assert.equal(r.ok, false);
  assert.equal(r.status, 403);
  assert.equal(r.errorCode, 'ErrorAccessDenied');
  assert.equal(r.requestId, 'req-9');
  assert.equal(fetchImpl.calls.filter((c) => c.url.includes('/sendMail')).length, 1);
  assert.deepEqual(sleeps, []);
});

test('bad client secret: surfaces the Entra error, never calls sendMail, never leaks the secret', async () => {
  const { m, fetchImpl } = mailer([
    json(401, { error: 'invalid_client', error_description: 'AADSTS7000215: Invalid client secret provided.\r\nTrace ID: abc' }),
  ]);
  const r = await m.send('a@sebsaworld.com', EMAIL);
  assert.equal(r.ok, false);
  assert.equal(r.errorCode, 'invalid_client');
  assert.match(r.message, /AADSTS7000215/);
  assert.equal(fetchImpl.calls.length, 1);
  assert.ok(!JSON.stringify(r).includes(CONFIG.clientSecret), 'secret must not appear in the result');
});

test('network failure on send is retried, then succeeds', async () => {
  const { m, sleeps } = mailer([tokenOk(), new TypeError('fetch failed'), accepted()]);
  const r = await m.send('a@sebsaworld.com', EMAIL);
  assert.equal(r.ok, true);
  assert.equal(r.attempts, 2);
  assert.deepEqual(sleeps, [1000]);
});

test('attachments are sent as base64 fileAttachments; oversize ones are refused before any request', async () => {
  const pdf = Buffer.from('%PDF-1.4 fake');
  const { m, fetchImpl } = mailer([tokenOk(), accepted()]);
  await m.send('a@sebsaworld.com', { ...EMAIL, attachments: [{ filename: 'cert.pdf', content: pdf, contentType: 'application/pdf' }] });
  const att = JSON.parse(fetchImpl.calls[1].init.body).message.attachments[0];
  assert.equal(att['@odata.type'], '#microsoft.graph.fileAttachment');
  assert.equal(att.name, 'cert.pdf');
  assert.equal(att.contentType, 'application/pdf');
  assert.equal(Buffer.from(att.contentBytes, 'base64').toString(), '%PDF-1.4 fake');

  const big = mailer([]);
  const r = await big.m.send('a@sebsaworld.com', { ...EMAIL, attachments: [{ filename: 'x.bin', content: Buffer.alloc(3 * 1024 * 1024 + 1), contentType: 'application/octet-stream' }] });
  assert.equal(r.errorCode, 'attachment_too_large');
  assert.equal(big.fetchImpl.calls.length, 0);
});

test('malformed or injected recipients are rejected before any request', async () => {
  for (const bad of ['', 'no-at-sign', 'a@b', 'a@b.com\nBcc: evil@x.com', 'a@b.com, c@d.com', 'a b@c.com', '<a@b.com>']) {
    const { m, fetchImpl } = mailer([]);
    const r = await m.send(bad, EMAIL);
    assert.equal(r.ok, false, `should reject ${JSON.stringify(bad)}`);
    assert.equal(r.errorCode, 'invalid_recipient');
    assert.equal(fetchImpl.calls.length, 0);
  }
});

test('never more than maxConcurrent sendMail requests in flight (Graph limits ~4 per mailbox)', async () => {
  let inFlight = 0;
  let peak = 0;
  const fetchImpl = async (url) => {
    if (String(url).includes('/oauth2/')) return tokenOk();
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 15));
    inFlight--;
    return accepted();
  };
  const m = createGraphMailer(CONFIG, { fetchImpl, sleep: async () => {}, maxConcurrent: 2 });
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => m.send(`u${i}@sebsaworld.com`, EMAIL)));
  assert.ok(results.every((r) => r.ok));
  assert.ok(peak <= 2, `peak concurrency was ${peak}`);
});

// ── the provider switch in sendEmail ───────────────────────────────────────────────────────────
function loadSendEmail(envOverrides, { nodemailerSent = [] } = {}) {
  const env = {
    EMAIL_PROVIDER: 'brevo', EMAIL_FROM_NAME: 'SEBSA CV Generator', EMAIL_FROM_ADDRESS: 'noreply@example.com',
    BREVO_SMTP_LOGIN: 'login', BREVO_SMTP_KEY: 'key', ...envOverrides,
  };
  const requireEnv = (k) => { if (!env[k]) throw new Error(`Missing required environment variable: ${k}.`); return env[k]; };
  return load('lib/email/sendEmail.ts', {
    // `import nodemailer from ...` compiles to nodemailer.default, so expose both shapes.
    nodemailer: (() => {
      const api = { createTransport: () => ({ sendMail: async (m) => { nodemailerSent.push(m); } }) };
      return { ...api, default: api };
    })(),
    '@/lib/env': { env, requireEnv },
    '@/lib/email/graphMail': load('lib/email/graphMail.ts'),
  });
}
const CONTENT = { subject: 'S', html: '<p>h</p>', text: 'h' };

test('sendEmail defaults to Brevo and forwards attachments to nodemailer (today\'s behaviour)', async () => {
  const sent = [];
  const { sendEmail } = loadSendEmail({}, { nodemailerSent: sent });
  const att = [{ filename: 'a.pdf', content: Buffer.from('x'), contentType: 'application/pdf' }];
  assert.equal(await sendEmail('p@sebsaworld.com', { ...CONTENT, attachments: att }), true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'p@sebsaworld.com');
  assert.equal(sent[0].text, 'h');
  assert.deepEqual(sent[0].attachments, att);
});

test('EMAIL_PROVIDER=graph uses Microsoft Graph and does not touch Brevo', async () => {
  const sent = [];
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push(String(url)); return String(url).includes('/oauth2/') ? tokenOk() : accepted(); };
  try {
    const { sendEmail } = loadSendEmail(
      { EMAIL_PROVIDER: 'graph', GRAPH_TENANT_ID: 't', GRAPH_CLIENT_ID: 'c', GRAPH_CLIENT_SECRET: 's', GRAPH_SENDER: 'cv.generator@sebsaworld.com' },
      { nodemailerSent: sent }
    );
    assert.equal(await sendEmail('p@sebsaworld.com', CONTENT), true);
    assert.equal(sent.length, 0, 'Brevo untouched');
    assert.ok(calls.some((u) => u.includes('graph.microsoft.com') && u.includes('/sendMail')));
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('graph selected but not configured: returns false, never throws', async () => {
  const { sendEmail } = loadSendEmail({ EMAIL_PROVIDER: 'graph' });
  assert.equal(await sendEmail('p@sebsaworld.com', CONTENT), false);
});

test('graph rejects the send (e.g. access denied): returns false, never throws', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => String(url).includes('/oauth2/') ? tokenOk() : json(403, { error: { code: 'ErrorAccessDenied', message: 'denied' } });
  try {
    const { sendEmail } = loadSendEmail({ EMAIL_PROVIDER: 'graph', GRAPH_TENANT_ID: 't', GRAPH_CLIENT_ID: 'c', GRAPH_CLIENT_SECRET: 's', GRAPH_SENDER: 'cv.generator@sebsaworld.com' });
    assert.equal(await sendEmail('p@sebsaworld.com', CONTENT), false);
  } finally {
    globalThis.fetch = realFetch;
  }
});

// ── EMAIL_PROVIDER parsing must never crash the app ────────────────────────────────────────────
function providerFor(value) {
  const saved = process.env.EMAIL_PROVIDER;
  if (value === undefined) delete process.env.EMAIL_PROVIDER; else process.env.EMAIL_PROVIDER = value;
  try {
    return load('lib/env.ts', { zod: require('zod') }).env.EMAIL_PROVIDER;
  } finally {
    if (saved === undefined) delete process.env.EMAIL_PROVIDER; else process.env.EMAIL_PROVIDER = saved;
  }
}

test('EMAIL_PROVIDER: unset or empty means brevo; graph is recognised regardless of case/spaces', () => {
  assert.equal(providerFor(undefined), 'brevo');
  assert.equal(providerFor(''), 'brevo');
  assert.equal(providerFor('   '), 'brevo');
  assert.equal(providerFor('graph'), 'graph');
  assert.equal(providerFor('GRAPH'), 'graph');
  assert.equal(providerFor('  Graph  '), 'graph');
  assert.equal(providerFor('brevo'), 'brevo');
});

test('EMAIL_PROVIDER: a typo falls back to brevo instead of crashing the whole app at import', () => {
  assert.doesNotThrow(() => providerFor('smtp'));
  assert.equal(providerFor('smtp'), 'brevo');
  assert.equal(providerFor('graphh'), 'brevo');
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

// Same approach as the other tests: compile the module with the project's compiler and inject its
// imports, so no Supabase, network or mail provider is needed.
function load(path, imports = {}) {
  const source = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', source)((id) => imports[id] ?? require(id), module, module.exports);
  return module.exports;
}

const rateLimit = load('lib/auth/rateLimit.ts');
const signupRules = load('lib/auth/signupRules.ts');
const { isPasswordValid } = load('lib/passwordValidation.ts');
const { createAuthEmailService } = load('lib/auth/authEmails.ts', {
  '@/lib/auth/rateLimit': rateLimit,
  '@/lib/auth/signupRules': signupRules,
});

const APP = 'https://sebsa-cv-generator.vercel.app';
const GOOD_PASSWORD = 'Str0ng!Passw0rd#2026';

function setup({ generateLink, sendResult = true, appUrl = APP, now } = {}) {
  const calls = { generateLink: [], deleteUser: [], send: [] };
  const admin = {
    auth: {
      admin: {
        generateLink: async (params) => {
          calls.generateLink.push(params);
          return generateLink ? generateLink(params) : { data: { properties: { action_link: 'https://x.supabase.co/auth/v1/verify?token=abc' }, user: { id: 'user-1' } }, error: null };
        },
        deleteUser: async (id) => { calls.deleteUser.push(id); return { error: null }; },
      },
    },
  };
  const svc = createAuthEmailService({
    admin,
    send: async (to, content) => { calls.send.push({ to, content }); return typeof sendResult === 'function' ? sendResult() : sendResult; },
    buildPasswordResetEmail: (link) => ({ subject: 'reset', html: `<a href="${link}">r</a>`, text: link }),
    buildSignupConfirmationEmail: (link, name) => ({ subject: 'confirm', html: `<a href="${link}">c</a>`, text: `${name} ${link}` }),
    isPasswordValid,
    appUrl,
    now,
  });
  return { svc, calls };
}
const notFound = () => ({ data: { properties: null, user: null }, error: { message: 'User not found', code: 'user_not_found' } });

// ── password reset ─────────────────────────────────────────────────────────────────────────────
test('reset: an active account gets one email with its link; the address is normalised', async () => {
  const { svc, calls } = setup();
  await svc.sendPasswordReset('  Dulaan.Sasitharan@SebsaWorld.com ', '1.1.1.1');

  assert.equal(calls.generateLink.length, 1);
  assert.equal(calls.generateLink[0].type, 'recovery');
  assert.equal(calls.generateLink[0].email, 'dulaan.sasitharan@sebsaworld.com');
  assert.equal(calls.send.length, 1);
  assert.equal(calls.send[0].to, 'dulaan.sasitharan@sebsaworld.com');
  assert.match(calls.send[0].content.html, /auth\/v1\/verify\?token=abc/);
});

test('reset: the link comes back to the configured app URL, never to anything the caller supplied', async () => {
  const { svc, calls } = setup({ appUrl: `${APP}/` });
  await svc.sendPasswordReset('a.b@sebsaworld.com', '1.1.1.1');
  assert.equal(calls.generateLink[0].options.redirectTo, `${APP}/auth/callback?flow=recovery&next=/auth/reset-password`);
});

test('reset: an unknown address sends nothing and does not throw (no account oracle)', async () => {
  const { svc, calls } = setup({ generateLink: notFound });
  await assert.doesNotReject(() => svc.sendPasswordReset('nobody.here@sebsaworld.com', '1.1.1.1'));
  assert.equal(calls.send.length, 0);
});

test('reset: a deactivated (banned) account is not sent a way back in; an expired ban is', async () => {
  const banned = (until) => () => ({ data: { properties: { action_link: 'https://x/v' }, user: { id: 'u', banned_until: until } }, error: null });
  const a = setup({ generateLink: banned(new Date(Date.now() + 86_400_000).toISOString()) });
  await a.svc.sendPasswordReset('a.b@sebsaworld.com', '1.1.1.1');
  assert.equal(a.calls.send.length, 0);

  const b = setup({ generateLink: banned(new Date(Date.now() - 86_400_000).toISOString()) });
  await b.svc.sendPasswordReset('a.b@sebsaworld.com', '1.1.1.1');
  assert.equal(b.calls.send.length, 1);
});

test('reset: malformed input never reaches Supabase', async () => {
  const { svc, calls } = setup();
  for (const bad of ['', '   ', 'no-at', 'a@b', 'a b@c.com', `${'x'.repeat(250)}@sebsaworld.com`, null, undefined, 42, { email: 'a@b.com' }]) {
    await svc.sendPasswordReset(bad, '1.1.1.1');
  }
  assert.equal(calls.generateLink.length, 0);
  assert.equal(calls.send.length, 0);
});

test('reset: the same address is limited to one email per minute, then allowed again', async () => {
  let clock = 1_000_000;
  const { svc, calls } = setup({ now: () => clock });
  await svc.sendPasswordReset('a.b@sebsaworld.com', '1.1.1.1');
  await svc.sendPasswordReset('a.b@sebsaworld.com', '2.2.2.2');
  clock += 30_000;
  await svc.sendPasswordReset('A.B@sebsaworld.com', '3.3.3.3'); // same address, different case
  assert.equal(calls.send.length, 1, 'repeats inside a minute are dropped');

  clock += 61_000;
  await svc.sendPasswordReset('a.b@sebsaworld.com', '4.4.4.4');
  assert.equal(calls.send.length, 2);
});

test('reset: one IP cannot mail many different people (limit 10 per 10 minutes)', async () => {
  const { svc, calls } = setup();
  for (let i = 0; i < 15; i++) await svc.sendPasswordReset(`person${i}.x@sebsaworld.com`, '9.9.9.9');
  assert.equal(calls.send.length, 10);
});

test('reset: a mail failure or a Supabase failure is swallowed, and the address is never logged', async () => {
  const logged = [];
  const origError = console.error;
  console.error = (...a) => logged.push(a.map(String).join(' '));
  try {
    const failing = setup({ sendResult: false });
    await assert.doesNotReject(() => failing.svc.sendPasswordReset('private.person@sebsaworld.com', '1.1.1.1'));
    const throwing = setup({ generateLink: () => { throw new Error('boom'); } });
    await assert.doesNotReject(() => throwing.svc.sendPasswordReset('private.person2@sebsaworld.com', '1.1.1.2'));
  } finally {
    console.error = origError;
  }
  assert.ok(logged.length >= 2, 'both failures were logged');
  assert.ok(logged.every((l) => !l.includes('private.person')), 'no address in the logs');
});

// ── signup ─────────────────────────────────────────────────────────────────────────────────────
const NEW_USER = { fullName: '  Ayesha   Perera ', email: 'Ayesha.Perera@sebsaworld.com', password: GOOD_PASSWORD };

test('signup: creates the account, then emails the confirmation link to that address', async () => {
  const { svc, calls } = setup();
  const r = await svc.register(NEW_USER, '1.1.1.1');

  assert.deepEqual(r, { ok: true });
  const p = calls.generateLink[0];
  assert.equal(p.type, 'signup');
  assert.equal(p.email, 'ayesha.perera@sebsaworld.com');
  assert.equal(p.password, GOOD_PASSWORD);
  assert.deepEqual(p.options.data, { full_name: 'Ayesha Perera' }, 'whitespace tidied');
  assert.equal(p.options.redirectTo, `${APP}/auth/callback?next=/dashboard`);
  assert.equal(calls.send.length, 1);
  assert.equal(calls.send[0].to, 'ayesha.perera@sebsaworld.com');
  assert.match(calls.send[0].content.text, /Ayesha Perera/);
  assert.ok(!JSON.stringify(calls.send).includes(GOOD_PASSWORD), 'the password is never put in an email');
  assert.equal(calls.deleteUser.length, 0);
});

test('signup: validation happens on the server, before anything is created', async () => {
  const { svc, calls } = setup();
  const cases = [
    [{ ...NEW_USER, email: 'someone@gmail.com' }, /SEBSA work email/],
    [{ ...NEW_USER, email: 'firstname@sebsaworld.com' }, /SEBSA work email/],
    [{ ...NEW_USER, email: 'a.b@sebsaworld.com.evil.com' }, /SEBSA work email/],
    [{ ...NEW_USER, password: 'short' }, /Password/],
    [{ ...NEW_USER, fullName: '   ' }, /full name/],
    [{ ...NEW_USER, fullName: 'x'.repeat(121) }, /full name/],
    [null, /SEBSA work email/],
  ];
  for (const [input, message] of cases) {
    const r = await svc.register(input, '1.1.1.1');
    assert.equal(r.ok, false);
    assert.match(r.error, message);
  }
  assert.equal(calls.generateLink.length, 0);
});

test('signup: an already-registered address looks identical to a new one and sends no email', async () => {
  for (const error of [{ message: 'A user with this email address has already been registered', code: 'email_exists' }, { message: 'User already registered' }]) {
    const { svc, calls } = setup({ generateLink: () => ({ data: { properties: null, user: null }, error }) });
    assert.deepEqual(await svc.register(NEW_USER, '1.1.1.1'), { ok: true });
    assert.equal(calls.send.length, 0);
    assert.equal(calls.deleteUser.length, 0);
  }
});

test('signup: an unexpected Supabase error gives a friendly message and leaks nothing', async () => {
  const { svc, calls } = setup({ generateLink: () => ({ data: { properties: null, user: null }, error: { message: 'duplicate key value violates unique constraint "users_pkey"', code: 'unexpected_failure' } }) });
  const r = await svc.register(NEW_USER, '1.1.1.1');
  assert.equal(r.ok, false);
  assert.ok(!/constraint|users_pkey/.test(r.error), 'provider message is not shown to the user');
  assert.equal(calls.send.length, 0);
});

test('signup: if the confirmation email cannot be sent, the new account is removed again', async () => {
  const { svc, calls } = setup({ sendResult: false });
  const r = await svc.register(NEW_USER, '1.1.1.1');
  assert.equal(r.ok, false);
  assert.match(r.error, /could not send the confirmation email/i);
  assert.deepEqual(calls.deleteUser, ['user-1']);
});

test('signup: throttled per address (3/hour) and per IP (5/hour)', async () => {
  const a = setup();
  for (let i = 0; i < 3; i++) assert.equal((await a.svc.register(NEW_USER, `10.0.0.${i}`)).ok, true);
  const blocked = await a.svc.register(NEW_USER, '10.0.0.9');
  assert.equal(blocked.ok, false);
  assert.match(blocked.error, /Too many attempts/);

  const b = setup();
  for (let i = 0; i < 5; i++) assert.equal((await b.svc.register({ ...NEW_USER, email: `person.n${'abcde'[i]}@sebsaworld.com` }, '7.7.7.7')).ok, true);
  assert.equal((await b.svc.register({ ...NEW_USER, email: 'person.nz@sebsaworld.com' }, '7.7.7.7')).ok, false);
});

// ── the limiter on its own ─────────────────────────────────────────────────────────────────────
test('rate limiter: sliding window, independent keys, bounded memory', () => {
  let clock = 0;
  const rl = rateLimit.createRateLimiter({ limit: 2, windowMs: 1000, now: () => clock, maxKeys: 3 });
  assert.equal(rl.allow('a'), true);
  assert.equal(rl.allow('a'), true);
  assert.equal(rl.allow('a'), false);
  assert.equal(rl.allow('b'), true, 'other keys are unaffected');
  clock = 1001;
  assert.equal(rl.allow('a'), true, 'window slid');
  for (let i = 0; i < 50; i++) rl.allow(`k${i}`); // must not grow without bound or throw
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

const source = ts.transpileModule(fs.readFileSync('lib/auth/recovery.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const recoveryModule = { exports: {} };
new Function('module', 'exports', source)(recoveryModule, recoveryModule.exports);

const {
  INVALID_RECOVERY_LINK_MESSAGE,
  PASSWORD_RESET_REQUESTED_MESSAGE,
  requestPasswordReset,
  updateRecoveryPassword,
  verifyRecoveryUser,
} = recoveryModule.exports;

test('successfully verifies the recovery user and updates the password', async () => {
  const calls = [];
  const auth = {
    getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }),
    updateUser: async (attributes) => {
      calls.push(attributes);
      return { data: { user: { id: 'user-1' } }, error: null };
    },
  };

  assert.deepEqual(await updateRecoveryPassword(auth, 'user-1', 'Secure1!'), { status: 'success' });
  assert.deepEqual(calls, [{ password: 'Secure1!' }]);
});

test('rejects expired sessions, invalid users, and already-used recovery state', async () => {
  let updateCalls = 0;
  const expiredAuth = {
    getUser: async () => ({ data: { user: null }, error: new Error('JWT expired') }),
    updateUser: async () => {
      updateCalls += 1;
      return { data: { user: null }, error: new Error('should not run') };
    },
  };
  const wrongUserAuth = {
    ...expiredAuth,
    getUser: async () => ({ data: { user: { id: 'different-user' } }, error: null }),
  };

  assert.equal(await verifyRecoveryUser(expiredAuth, 'user-1'), false);
  assert.deepEqual(await updateRecoveryPassword(expiredAuth, 'user-1', 'Secure1!'), { status: 'invalid-session' });
  assert.deepEqual(await updateRecoveryPassword(wrongUserAuth, 'user-1', 'Secure1!'), { status: 'invalid-session' });
  assert.deepEqual(await updateRecoveryPassword(wrongUserAuth, null, 'Secure1!'), { status: 'invalid-session' });
  assert.equal(updateCalls, 0);
  assert.match(INVALID_RECOVERY_LINK_MESSAGE, /invalid, expired, or has already been used/i);
});

test('repeated reset requests return the same non-enumerating response', async () => {
  let attempts = 0;
  const auth = {
    resetPasswordForEmail: async () => {
      attempts += 1;
      if (attempts === 2) throw new Error('rate limited');
      return { error: null };
    },
  };

  const accepted = await requestPasswordReset(auth, ' Person@Example.com ', 'https://example.com/auth/callback');
  const rateLimited = await requestPasswordReset(auth, 'missing@example.com', 'https://example.com/auth/callback');

  assert.equal(accepted, PASSWORD_RESET_REQUESTED_MESSAGE);
  assert.equal(rateLimited, PASSWORD_RESET_REQUESTED_MESSAGE);
  assert.equal(attempts, 2);
});

test('returns a provider error only while the verified recovery session remains valid', async () => {
  const providerError = new Error('Password should be different');
  const auth = {
    getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }),
    updateUser: async () => ({ data: { user: null }, error: providerError }),
  };

  assert.deepEqual(await updateRecoveryPassword(auth, 'user-1', 'Secure1!'), {
    status: 'error',
    error: providerError,
  });
});

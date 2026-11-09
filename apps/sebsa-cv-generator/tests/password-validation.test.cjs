const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

const source = ts.transpileModule(fs.readFileSync('lib/passwordValidation.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const passwordValidation = { exports: {} };
new Function('module', 'exports', source)(passwordValidation, passwordValidation.exports);

const { isPasswordValid, PASSWORD_REQUIREMENTS } = passwordValidation.exports;

test('accepts a password satisfying every policy requirement', () => {
  assert.equal(isPasswordValid('Secure1!'), true);
});

test('enforces the 8–64 character range', () => {
  assert.equal(isPasswordValid('Short1!'), false);
  assert.equal(isPasswordValid(`Aa1!${'x'.repeat(61)}`), false);
  assert.equal(isPasswordValid(`Aa1!${'x'.repeat(60)}`), true);
});

test('requires uppercase, lowercase, number, and non-whitespace special characters', () => {
  assert.equal(isPasswordValid('secure1!'), false);
  assert.equal(isPasswordValid('SECURE1!'), false);
  assert.equal(isPasswordValid('Secure!!'), false);
  assert.equal(isPasswordValid('Secure12'), false);
  assert.equal(isPasswordValid('Secure1 '), false);
});

test('rejects all whitespace and exposes every requested checklist rule', () => {
  assert.equal(isPasswordValid('Secure 1!'), false);
  assert.equal(isPasswordValid('Secure\t1!'), false);
  assert.deepEqual(
    PASSWORD_REQUIREMENTS.map((requirement) => requirement.label),
    [
      '8–64 characters',
      'One uppercase letter',
      'One lowercase letter',
      'One number',
      'One special character',
      'No spaces',
    ]
  );
});

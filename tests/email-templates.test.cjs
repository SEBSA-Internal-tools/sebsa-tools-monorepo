const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

// Compile the template module with the project's compiler; no Next.js runtime or env files needed.
function load(path, imports = {}) {
  const source = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', source)((id) => imports[id] ?? require(id), module, module.exports);
  return module.exports;
}

const templates = load('lib/email/templates.ts', { '@/lib/env': { env: { NEXT_PUBLIC_APP_URL: 'https://sebsa-cv-generator.vercel.app' } } });
const LINK = 'https://x.supabase.co/auth/v1/verify?token=abc&type=invite';
const everyEmail = () => [
  ['invite', templates.buildEmployeeInviteEmail(LINK, false)],
  ['invite (resend)', templates.buildEmployeeInviteEmail(LINK, true)],
  ['password reset', templates.buildPasswordResetEmail(LINK)],
  ['signup confirmation', templates.buildSignupConfirmationEmail(LINK, 'Ayesha Perera')],
  ['new profile', templates.buildNewProfileSubmittedEmail('A B')],
  ['profile approved', templates.buildProfileApprovedEmail('id-1', 'A B')],
];

test('invitation email states only the relative 4-hour limit: no hard-coded calendar date that can go stale', () => {
  for (const isResend of [false, true]) {
    const mail = templates.buildEmployeeInviteEmail(LINK, isResend);
    for (const part of [mail.html, mail.text]) {
      assert.ok(!/(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s*20\d\d/.test(part), 'no "Month 26, 2026" style date');
      assert.ok(!/Activation deadline/i.test(part));
      assert.match(part, /4 hours/);
    }
  }
});

test('the support contact is the company mailbox, never a personal webmail address', () => {
  const mail = templates.buildEmployeeInviteEmail(LINK, false);
  assert.ok(mail.html.includes('mailto:cv.generator@sebsaworld.com'));
  assert.ok(mail.text.includes('cv.generator@sebsaworld.com'));
  for (const [name, m] of everyEmail()) {
    assert.ok(!/@(gmail|yahoo|hotmail|outlook)\.com/i.test(m.html + m.text), `${name} contains a personal webmail address`);
  }
});

test('reset and signup emails carry the link, escape the name, and have a plain-text part', () => {
  const reset = templates.buildPasswordResetEmail(LINK);
  assert.ok(reset.html.includes(LINK.replaceAll('&', '&amp;')) && reset.text.includes(LINK));
  assert.match(reset.subject, /Reset your SEBSA CV Generator password/);

  const signup = templates.buildSignupConfirmationEmail(LINK, '<script>alert(1)</script> Ayesha');
  assert.ok(!signup.html.includes('<script>'), 'name is HTML-escaped');
  assert.ok(signup.html.includes('&lt;script&gt;'));
  assert.ok(signup.text.length > 0);
  assert.equal(signup.subject, 'Confirm your SEBSA CV Generator account');
});

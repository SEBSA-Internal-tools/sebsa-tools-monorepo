const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

const source = ts.transpileModule(fs.readFileSync('lib/assessment/rules.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loaded = { exports: {} };
new Function('module', 'exports', source)(loaded, loaded.exports);
const { selectAssessmentRecipients, reminderRecipientIds } = loaded.exports;

test('manual cycle creation includes only employees selected by the administrator', () => {
  const people = [{ userId: 'one' }, { userId: 'two' }, { userId: 'three' }];
  assert.deepEqual(selectAssessmentRecipients(people, ['three', 'one']), [{ userId: 'one' }, { userId: 'three' }]);
});

test('manual reminders include not-started, in-progress, and retry-available employees', () => {
  const invitations = [
    { userId: 'not-started', status: 'pending' },
    { userId: 'in-progress', status: 'opened' },
    { userId: 'retry', status: 'opened' },
    { userId: 'passed', status: 'completed' },
    { userId: 'failed-final', status: 'opened' },
  ];
  const attempts = [
    { userId: 'retry', isFinal: false },
    { userId: 'passed', isFinal: true },
    { userId: 'failed-final', isFinal: true },
  ];
  assert.deepEqual(reminderRecipientIds(invitations, attempts), ['not-started', 'in-progress', 'retry']);
});

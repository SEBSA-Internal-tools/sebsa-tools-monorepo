const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('pending profile edits are versioned and remain one row per profile', () => {
  const migration = read('supabase/migrations/0037_profile_change_resubmission.sql');
  assert.match(migration, /add column if not exists pending_change_version uuid/);
  assert.match(migration, /where pending_change is not null and pending_change_version is null/);
  assert.match(migration, /pending_change_version\s*\n\s*from public\.profiles where pending_change is not null/);
  assert.match(migration, /enforce_employee_pending_change_only/);
  assert.doesNotMatch(migration, /create table[^;]*pending_approvals/i);
});

test('employees can edit the latest pending snapshot and resubmit with compare-and-swap', () => {
  const client = read('app/(authenticated)/my-profile/MyProfileClient.tsx');
  const action = read('app/(authenticated)/my-profile/actions.ts');
  const profile = read('app/(authenticated)/repository/[id]/EmployeeProfileClient.tsx');

  assert.match(client, /const pending = employee\.pendingChange/);
  assert.match(client, /proposeProfileChangeAction\([\s\S]*pendingVersion\)/);
  assert.doesNotMatch(client, /if \(employee\.hasPendingChange \|\| submitted\)/);
  assert.doesNotMatch(profile, /employee\.status === 'published' && !employee\.hasPendingChange/);

  assert.match(action, /pending_change_version:\s*nextVersion/);
  assert.match(action, /updateQuery\.eq\('pending_change_version', expectedPendingVersion\)/);
  assert.match(action, /updateQuery\.is\('pending_change_version', null\)/);
  assert.match(action, /change\.avatarUrl \?\? \(current\.pending_change/);
});

test('review actions cannot approve or reject a stale submission version', () => {
  const action = read('app/(authenticated)/review/actions.ts');
  const client = read('app/(authenticated)/review/ReviewClient.tsx');

  assert.match(action, /reviewedVersion !== expectedPendingVersion/);
  assert.match(action, /clearQuery\.eq\('pending_change_version', reviewedVersion\)/);
  assert.match(action, /rejectQuery\.eq\('pending_change_version', reviewedVersion\)/);
  assert.match(action, /newer_submission_pending: newerSubmissionPending/);
  assert.match(client, /approveChangeAction : rejectChangeAction\)\(item\.profileId, item\.pendingVersion \?\? null\)/);
  assert.match(client, /getLatestPendingChangeAction\(item\.profileId\)/);
});

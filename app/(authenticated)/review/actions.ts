'use server';

import { employeeDetailFields } from '@/lib/employeeDetails';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser, isReviewerOrAbove, type CurrentUser } from '@/lib/auth';
import { updateEmployee, getEmployeeById } from '@/services/employee-service';
import { notifyUser } from '@/lib/notifications';
import { emailUser } from '@/lib/email/notify';
import { buildProfileApprovedEmail, buildProfileChangesApprovedEmail } from '@/lib/email/templates';
import type { UpdateEmployeeInput, Employee } from '@/types/domain';
import { profileChanges, recordAuditLog } from '@/services/audit-service';

export type PendingItemType = 'new_profile' | 'claim' | 'change';

export interface ProfileFieldDiff {
  field: string;
  /** Only set for simple scalar fields (Role, Department, Objective) — list-shaped fields
   *  (Experience, Education, etc.) just say whether they changed, not a full entry-by-entry diff. */
  before?: string;
  after?: string;
}

export interface PendingItem {
  profileId: string;
  name: string;
  email: string;
  type: PendingItemType;
  submittedAt: string;
  proposedChange?: UpdateEmployeeInput;
  /** Only populated for type 'change' — which fields actually differ from the live profile. */
  changedFields?: ProfileFieldDiff[];
}

/** Compares the live profile against a proposed change and returns only the fields that
 *  actually differ — list-shaped fields (experience/academic/etc.) are compared as whole
 *  arrays (deep equality) since a full per-entry diff isn't worth the complexity here. */
function computeChangedFields(current: Employee, proposed: UpdateEmployeeInput): ProfileFieldDiff[] {
  const diffs: ProfileFieldDiff[] = [];
  for (const field of [{ key: 'name', label: 'Full Name' } as const, ...employeeDetailFields]) {
    if (proposed[field.key] !== undefined && (current[field.key] ?? '') !== (proposed[field.key] ?? '')) {
      diffs.push({ field: field.label, before: String(current[field.key] ?? '(none)'), after: String(proposed[field.key] ?? '(none)') });
    }
  }

  const currentRole = current.currentPosition || current.role || '';
  const proposedRole = proposed.currentPosition || proposed.role || '';
  if (currentRole !== proposedRole) {
    diffs.push({ field: 'Role', before: currentRole || '—', after: proposedRole || '—' });
  }

  if ((current.department || '') !== (proposed.department || '')) {
    diffs.push({ field: 'Department', before: current.department || '—', after: proposed.department || '—' });
  }

  if ((current.summary ?? '') !== (proposed.summary ?? '')) {
    diffs.push({
      field: 'Objective',
      before: current.summary || '(none)',
      after: proposed.summary || '(none)',
    });
  }

  const normalizeText = (value: unknown) => String(value ?? '').trim();
  const normalizers: Record<string, (entry: any) => unknown> = {
    'Work Experience': (entry) => ({
      position: normalizeText(entry.position), company: normalizeText(entry.company),
      period: normalizeText(entry.period), tasks: (entry.tasks ?? []).map(normalizeText),
    }),
    Education: (entry) => ({
      qualification: normalizeText(entry.qualification), institution: normalizeText(entry.institution),
      period: normalizeText(entry.period),
    }),
    'Special Projects': (entry) => ({
      title: normalizeText(entry.title), brief: normalizeText(entry.brief),
      skills: (entry.skills ?? []).map(normalizeText),
    }),
    Certifications: (entry) => ({
      name: normalizeText(entry.name), issuer: normalizeText(entry.issuer), year: normalizeText(entry.year),
    }),
  };

  const listField = (
    label: string,
    currentList: unknown[] | undefined,
    proposedList: unknown[] | undefined
  ) => {
    const before = currentList ?? [];
    const after = proposedList ?? [];
    const normalize = normalizers[label];
    const normalizedBefore = normalize ? before.map(normalize) : before;
    const normalizedAfter = normalize ? after.map(normalize) : after;
    if (JSON.stringify(normalizedBefore) !== JSON.stringify(normalizedAfter)) {
      diffs.push({ field: label, before: `${before.length} entries`, after: `${after.length} entries` });
    }
  };

  listField('Work Experience', current.cvExperience, proposed.cvExperience);
  listField('Education', current.cvAcademic, proposed.cvAcademic);
  listField('Special Projects', current.specialProjects, proposed.specialProjects);
  listField('Certifications', current.cvCertifications, proposed.cvCertifications);

  // Proposed only ever carries a new avatarUrl when the employee actually replaced their photo
  // (ProfileChangeSubmission's doc comment) — no need to compare signed URLs, presence is enough.
  if (proposed.avatarUrl) {
    diffs.push({ field: 'Photo' });
  }

  return diffs;
}

async function requireReviewer(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated.');
  if (!isReviewerOrAbove(user.role)) {
    throw new Error('Unauthorized: Admin, Super Admin, or CV Reviewer role required.');
  }
  return user;
}

function revalidateAll() {
  revalidatePath('/review');
  revalidatePath('/repository');
  revalidatePath('/dashboard');
}

/**
 * Everything currently awaiting Super Admin/CV Reviewer review — three independent maker-checker
 * gates (docs/04-rbac-security.md §10): a new self-service profile pending its first publish, a
 * claim request pending link approval, and a proposed edit to an already-published profile.
 */
export async function listPendingItemsAction(): Promise<PendingItem[]> {
  await requireReviewer();
  const adminClient = createAdminClient();

  const { data, error } = await adminClient
    .from('profiles')
    .select(
      'id, full_name, email, status, pending_claim_user_id, pending_change, pending_change_submitted_at, created_at'
    )
    .or('status.eq.draft,pending_claim_user_id.not.is.null,pending_change.not.is.null');

  if (error) throw error;

  const items: PendingItem[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (data ?? []) as any[]) {
    if (row.status === 'draft') {
      items.push({
        profileId: row.id,
        name: row.full_name,
        email: row.email,
        type: 'new_profile',
        submittedAt: row.created_at,
      });
    }
    if (row.pending_claim_user_id) {
      items.push({
        profileId: row.id,
        name: row.full_name,
        email: row.email,
        type: 'claim',
        submittedAt: row.created_at,
      });
    }
    if (row.pending_change) {
      const proposedChange = row.pending_change as UpdateEmployeeInput;
      // Fetch the live profile to diff against — one extra query per pending change, which is
      // fine at review-queue scale (a handful of items at a time, not a paginated list).
      let changedFields: ProfileFieldDiff[] | undefined;
      try {
        const current = await getEmployeeById(adminClient, row.id);
        if (current) changedFields = computeChangedFields(current, proposedChange);
      } catch (err) {
        console.error(`Failed to diff pending change for profile ${row.id}:`, err);
      }

      items.push({
        profileId: row.id,
        name: row.full_name,
        email: row.email,
        type: 'change',
        submittedAt: row.pending_change_submitted_at ?? row.created_at,
        proposedChange,
        changedFields,
      });
    }
  }

  return items.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
}

/** Publishes a self-service "created from scratch" profile (0018), making it searchable. */
export async function approveNewProfileAction(profileId: string): Promise<void> {
  const user = await requireReviewer();
  const adminClient = createAdminClient();

  const { data: row, error: fetchError } = await adminClient
    .from('profiles')
    .select('user_id, full_name')
    .eq('id', profileId)
    .single();
  if (fetchError) throw fetchError;

  const { error } = await adminClient
    .from('profiles')
    .update({ status: 'published', updated_at: new Date().toISOString() })
    .eq('id', profileId)
    .eq('status', 'draft');
  if (error) throw error;
  await recordAuditLog({ actorId: user.id, action: 'APPROVE', entityType: 'employee_profile', entityId: profileId, metadata: { operation: 'publish_new_profile' } });

  if (row.user_id) {
    await notifyUser(adminClient, row.user_id, {
      type: 'profile_approved',
      title: 'Profile approved',
      message: 'Your profile is now live in the company repository.',
      link: `/repository/${profileId}`,
    });
    await emailUser(adminClient, row.user_id, buildProfileApprovedEmail(profileId, row.full_name));
  }
  revalidateAll();
}

/** Rejects a never-published self-service submission — nothing to revert to, so it's deleted. */
export async function rejectNewProfileAction(profileId: string): Promise<void> {
  const user = await requireReviewer();
  const adminClient = createAdminClient();

  // Fetched before the delete — there's no row left to read from afterwards.
  const { data: row, error: fetchError } = await adminClient
    .from('profiles')
    .select('user_id')
    .eq('id', profileId)
    .single();
  if (fetchError) throw fetchError;

  const { error } = await adminClient.from('profiles').delete().eq('id', profileId).eq('status', 'draft');
  if (error) throw error;
  await recordAuditLog({ actorId: user.id, action: 'REJECT', entityType: 'employee_profile', entityId: profileId, metadata: { operation: 'reject_and_delete_draft' } });

  if (row.user_id) {
    await notifyUser(adminClient, row.user_id, {
      type: 'profile_rejected',
      title: 'Profile rejected',
      message: 'Your submitted profile was rejected. You can create a new one whenever you’re ready.',
      link: '/onboarding',
    });
  }
  revalidateAll();
}

/** Links the requesting employee's account to the profile (0020 profiles_self_claim_request). */
export async function approveClaimAction(profileId: string): Promise<void> {
  const user = await requireReviewer();
  const adminClient = createAdminClient();

  const { data: row, error: fetchError } = await adminClient
    .from('profiles')
    .select('pending_claim_user_id')
    .eq('id', profileId)
    .single();
  if (fetchError) throw fetchError;
  if (!row.pending_claim_user_id) throw new Error('No pending claim on this profile.');

  const { error } = await adminClient
    .from('profiles')
    .update({
      user_id: row.pending_claim_user_id,
      pending_claim_user_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', profileId)
    .is('user_id', null);
  if (error) throw error;
  await recordAuditLog({ actorId: user.id, action: 'APPROVE', entityType: 'employee_profile', entityId: profileId, metadata: { operation: 'account_claim', claimed_by: row.pending_claim_user_id } });

  await notifyUser(adminClient, row.pending_claim_user_id, {
    type: 'claim_approved',
    title: 'Account linked',
    message: 'Your account is now linked to your profile.',
    link: `/repository/${profileId}`,
  });
  revalidateAll();
}

export async function rejectClaimAction(profileId: string): Promise<void> {
  const user = await requireReviewer();
  const adminClient = createAdminClient();

  const { data: row, error: fetchError } = await adminClient
    .from('profiles')
    .select('pending_claim_user_id')
    .eq('id', profileId)
    .single();
  if (fetchError) throw fetchError;

  const { error } = await adminClient
    .from('profiles')
    .update({ pending_claim_user_id: null })
    .eq('id', profileId);
  if (error) throw error;
  await recordAuditLog({ actorId: user.id, action: 'REJECT', entityType: 'employee_profile', entityId: profileId, metadata: { operation: 'account_claim', requested_by: row.pending_claim_user_id } });

  if (row.pending_claim_user_id) {
    await notifyUser(adminClient, row.pending_claim_user_id, {
      type: 'claim_rejected',
      title: 'Account claim rejected',
      message: 'Your request to link your account to that profile was rejected.',
      link: '/onboarding',
    });
  }
  revalidateAll();
}

/**
 * Merges a proposed edit into the live profile. pending_change is a complete UpdateEmployeeInput
 * (proposeProfileChangeAction fills in the immutable name/email server-side, see
 * app/(authenticated)/my-profile/actions.ts) — updateEmployee() does a full replace of
 * experiences/projects/certifications/skills, which is correct here because the self-edit form
 * always submits the complete current+edited state, never a partial patch.
 */
export async function approveChangeAction(profileId: string): Promise<void> {
  const user = await requireReviewer();
  const adminClient = createAdminClient();

  const { data: row, error: fetchError } = await adminClient
    .from('profiles')
    .select('pending_change, user_id, full_name')
    .eq('id', profileId)
    .single();
  if (fetchError) throw fetchError;
  const change = row.pending_change as UpdateEmployeeInput | null;
  if (!change) throw new Error('No pending change on this profile.');

  const current = await getEmployeeById(adminClient, profileId);
  if (!current) throw new Error('Employee profile not found.');
  const changes = profileChanges(current, change);

  await updateEmployee(adminClient, profileId, change, user.id);

  const { error } = await adminClient
    .from('profiles')
    .update({ pending_change: null, pending_change_submitted_at: null })
    .eq('id', profileId);
  if (error) throw error;
  await recordAuditLog({
    actorId: user.id,
    action: 'APPROVE',
    entityType: 'employee_profile',
    entityId: profileId,
    metadata: { operation: 'profile_change', target_name: row.full_name, changes },
  });

  if (row.user_id) {
    await notifyUser(adminClient, row.user_id, {
      type: 'change_approved',
      title: 'Profile changes approved',
      message: 'Your proposed changes are now live on your profile.',
      link: `/repository/${profileId}`,
    });
    await emailUser(
      adminClient,
      row.user_id,
      buildProfileChangesApprovedEmail(profileId, row.full_name)
    );
  }
  // Log the action back to the reviewer's own feed too — previously only the submitting employee
  // got a resulting notification, so the admin who approved it had no record it had gone through.
  await notifyUser(adminClient, user.id, {
    type: 'change_approved',
    title: 'Profile changes approved',
    message: `You approved ${row.full_name}'s proposed profile changes.`,
    link: `/repository/${profileId}`,
  });
  revalidateAll();
}

export async function rejectChangeAction(profileId: string): Promise<void> {
  const user = await requireReviewer();
  const adminClient = createAdminClient();

  const { data: row, error: fetchError } = await adminClient
    .from('profiles')
    .select('user_id, full_name')
    .eq('id', profileId)
    .single();
  if (fetchError) throw fetchError;

  const { error } = await adminClient
    .from('profiles')
    .update({ pending_change: null, pending_change_submitted_at: null })
    .eq('id', profileId);
  if (error) throw error;
  await recordAuditLog({ actorId: user.id, action: 'REJECT', entityType: 'employee_profile', entityId: profileId, metadata: { operation: 'profile_change' } });

  if (row.user_id) {
    await notifyUser(adminClient, row.user_id, {
      type: 'change_rejected',
      title: 'Profile changes rejected',
      message: 'Your proposed profile changes were rejected. Your live profile is unchanged.',
      link: `/repository/${profileId}`,
    });
  }
  await notifyUser(adminClient, user.id, {
    type: 'change_rejected',
    title: 'Profile changes rejected',
    message: `You rejected ${row.full_name}'s proposed profile changes.`,
    link: `/repository/${profileId}`,
  });
  revalidateAll();
}

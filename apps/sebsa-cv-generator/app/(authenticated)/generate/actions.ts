'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser, canEditProfilesAndCvs } from '@/lib/auth';
import { getSavedGeneratedCv, saveGeneratedCv } from '@/services/generated-cv-service';
import { recordAuditLog } from '@/services/audit-service';

export async function getSavedGeneratedCvAction(profileId: string): Promise<Record<string, any> | null> {
  const user = await getCurrentUser();
  if (!user || !canEditProfilesAndCvs(user.role)) throw new Error('Not authorized.');
  return getSavedGeneratedCv(await createClient(), profileId);
}

export async function saveGeneratedCvAction(profileId: string, content: Record<string, any>): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated.');
  if (!canEditProfilesAndCvs(user.role)) throw new Error('Not authorized.');

  const adminClient = createAdminClient();
  const previousContent = await getSavedGeneratedCv(adminClient, profileId);
  const saved = await saveGeneratedCv(adminClient, { profileId, content, userId: user.id });
  await recordAuditLog({
    actorId: user.id,
    action: saved.created ? 'CREATE' : 'UPDATE',
    entityType: 'generated_cv',
    entityId: saved.row.id,
    metadata: {
      profile_id: profileId,
      content_sections: Object.keys(content),
      ...(saved.created ? {} : {
        changes: Object.keys(content)
          .filter((field) => JSON.stringify(previousContent?.[field]) !== JSON.stringify(content[field]))
          .map((field) => ({
            field,
            old_value: previousContent?.[field] ?? null,
            new_value: content[field] ?? null,
          })),
      }),
    },
  });
}

'use server';

import { getCurrentUser } from '@/lib/auth';
import { recordAuditLog, listAuditLogsPage, type AuditLogRecord } from '@/services/audit-service';
import { createClient } from '@/lib/supabase/server';
import type { PaginatedResult } from '@/lib/pagination';

export async function listAuditLogsPageAction(page: number, pageSize: number): Promise<PaginatedResult<AuditLogRecord>> {
  const user = await getCurrentUser();
  if (!user) return { items: [], total: 0, page: 1, pageSize: 20 };
  return listAuditLogsPage(await createClient(), page, pageSize);
}

/** Records a completed client-side PDF export without changing the CV or profile being exported. */
export async function recordCvDownloadAction(
  profileId: string,
  options: { anonymous: boolean; customized: boolean }
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated.');
  await recordAuditLog({
    actorId: user.id,
    action: 'DOWNLOAD',
    entityType: options.customized ? 'generated_cv' : 'employee_profile',
    entityId: profileId,
    metadata: { format: 'pdf', anonymous: options.anonymous },
  });
}

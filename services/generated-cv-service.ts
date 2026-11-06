import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type GeneratedCvRow,
  getLatestGeneratedCvRow,
  insertGeneratedCvRow,
  updateGeneratedCvRow,
} from '@/repositories/generated-cv-repository';

export async function getSavedGeneratedCv(
  supabase: SupabaseClient,
  profileId: string
): Promise<Record<string, any> | null> {
  const row = await getLatestGeneratedCvRow(supabase, profileId);
  return row ? row.content : null;
}

export async function saveGeneratedCv(
  supabase: SupabaseClient,
  params: {
    profileId: string;
    content: Record<string, any>;
    userId: string;
  }
): Promise<{ row: GeneratedCvRow; created: boolean }> {
  const existing = await getLatestGeneratedCvRow(supabase, params.profileId);

  if (existing) {
    const row = await updateGeneratedCvRow(
      supabase,
      existing.id,
      params.content,
      params.userId,
      { provider: 'rules', model: 'weighted-keyword-v1' }
    );
    return { row, created: false };
  } else {
    const row = await insertGeneratedCvRow(supabase, {
      profile_id: params.profileId,
      status: 'draft',
      content: params.content,
      ai_provider: 'rules',
      ai_model: 'weighted-keyword-v1',
      created_by: params.userId,
      updated_by: params.userId,
    });
    return { row, created: true };
  }
}

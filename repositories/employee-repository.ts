import { employeeDetailFields, normalizeEmployeeDetails } from '@/lib/employeeDetails';
import type { UpdateEmployeeInput } from '@/types/domain';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CreateEmployeeInput } from '@/types/domain';
import type { CvExperienceEntry, CvAcademicEntry, CvProjectEntry, CvCertificationEntry } from '@/lib/cvTypes';
import { toTitleCase, toUpperCaseText } from '@/lib/text';

/**
 * Server-only. Raw Supabase queries for the `profiles` aggregate (profiles + experiences +
 * projects + certifications + skills + departments). Callers (services/employee-service.ts) map
 * these rows into the UI-facing `Employee` shape.
 *
 * Row shapes are `any` because `types/database.ts` is still the Phase-1 placeholder — swap to
 * `Database['public']['Tables']['profiles']['Row']` etc. once real types are generated (Phase 2).
 */

const LIST_SELECT = `
  id, full_name, display_name, email, role_title, years_experience,
  avatar_url, updated_at, user_id,
  departments ( name )
`;

const DETAIL_SELECT = `
  ${LIST_SELECT},
  ${employeeDetailFields.filter(f => f.key !== 'displayName').map(f => f.column).join(', ')},
  education, summary, status, pending_change, pending_change_submitted_at,
  experiences ( company, role_title, employment_type, start_date, end_date, is_current, description, display_order ),
  projects ( name, description, skills, display_order ),
  certifications ( name, issuer, issued_date )
`;

export async function listEmployeeRows(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('profiles')
    .select(LIST_SELECT)
    .eq('status', 'published')
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getEmployeeRowById(supabase: SupabaseClient, profileId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select(DETAIL_SELECT)
    .eq('id', profileId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Attempts to parse a period string like "Jan 2020 – Present" or "2018 – 2021" into
 * approximate start / end dates and an is_current flag. Returns null values when parsing fails.
 */
function parsePeriod(period: string): {
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
} {
  if (!period) return { startDate: null, endDate: null, isCurrent: false };

  const isCurrent =
    /present|current|now/i.test(period) || period.trim().endsWith('–') || period.trim().endsWith('-');

  // Extract year numbers
  const years = period.match(/\d{4}/g) ?? [];
  const startYear = years[0] ?? null;
  const endYear = !isCurrent && years[1] ? years[1] : null;

  return {
    startDate: startYear ? `${startYear}-01-01` : null,
    endDate: endYear ? `${endYear}-12-31` : null,
    isCurrent,
  };
}

/** Converts a year string like "2022" into an ISO date string "2022-01-01". */
function yearToDate(year: string): string | null {
  const y = parseInt(year, 10);
  if (isNaN(y) || y < 1900 || y > 2100) return null;
  return `${y}-01-01`;
}

export async function createEmployeeRow(
  supabase: SupabaseClient,
  input: CreateEmployeeInput,
  createdBy: string
): Promise<string> {
  const details = normalizeEmployeeDetails(input);
  const detailColumns = Object.fromEntries(employeeDetailFields
    .filter(field => details[field.key] !== undefined)
    .map(field => [field.column, details[field.key]]));
  const { data: dept } = await supabase
    .from('departments')
    .select('id')
    .eq('name', input.department)
    .maybeSingle();

  // Serialise academic entries as JSON into the profiles.education text column
  const educationJson = input.cvAcademic && input.cvAcademic.length > 0
    ? JSON.stringify(input.cvAcademic)
    : null;

  const { data, error } = await supabase
    .from('profiles')
    .insert({
      ...detailColumns,
      full_name: input.name,
      email: input.email,
      role_title: toUpperCaseText(input.currentPosition ?? input.role),
      department_id: dept?.id ?? null,
      // Self-service submissions start as 'draft' (not searchable/usable) until an Admin
      // reviews them — see docs/04-rbac-security.md §0. Admin/Reviewer-created profiles keep
      // today's behavior of going straight to 'published', whether or not an account was
      // linked (linkedUserId, §14) — the Admin's own action doesn't need self-approval.
      status: input.selfServiceUserId ? 'draft' : 'published',
      user_id: input.selfServiceUserId ?? input.linkedUserId ?? null,
      education: educationJson,
      summary: input.summary ?? null,
      avatar_url: input.avatarUrl ?? null,
      created_by: createdBy,
      updated_by: createdBy,
    })
    .select('id')
    .single();

  if (error) throw error;
  const profileId = data.id as string;

  // ── Insert structured experience entries ──────────────────────────────────
  if (input.cvExperience && input.cvExperience.length > 0) {
    await insertExperiences(supabase, profileId, input.cvExperience);
  }

  // ── Insert special projects ───────────────────────────────────────────────
  if (input.specialProjects && input.specialProjects.length > 0) {
    await insertProjects(supabase, profileId, input.specialProjects);
  }

  // ── Insert certifications ─────────────────────────────────────────────────
  if (input.cvCertifications && input.cvCertifications.length > 0) {
    await insertCertifications(supabase, profileId, input.cvCertifications);
  }



  return profileId;
}

async function insertExperiences(
  supabase: SupabaseClient,
  profileId: string,
  entries: CvExperienceEntry[]
) {
  const rows = entries.map((exp, i) => {
    const { startDate, endDate, isCurrent } = parsePeriod(exp.period);
    return {
      profile_id: profileId,
      role_title: toTitleCase(exp.position),
      company: exp.company,
      employment_type: 'Full-time',
      start_date: startDate,
      end_date: endDate,
      is_current: isCurrent,
      // Serialise point-wise tasks as JSON inside the description column
      description: JSON.stringify(exp.tasks),
      display_order: i,
    };
  });

  const { error } = await supabase.from('experiences').insert(rows);
  if (error) throw error;
}

async function insertProjects(
  supabase: SupabaseClient,
  profileId: string,
  projects: CvProjectEntry[]
) {
  const rows = projects.map((p, i) => ({
    profile_id: profileId,
    name: p.title,
    description: p.brief,
    skills: p.skills ?? [],
    display_order: i,
  }));

  const { error } = await supabase.from('projects').insert(rows);
  if (error) throw error;
}

async function insertCertifications(
  supabase: SupabaseClient,
  profileId: string,
  certs: CvCertificationEntry[]
) {
  const rows = certs.map((c) => ({
    profile_id: profileId,
    name: c.name,
    issuer: c.issuer,
    issued_date: yearToDate(c.year),
  }));

  const { error } = await supabase.from('certifications').insert(rows);
  if (error) throw error;
}



export async function deleteEmployeeRow(supabase: SupabaseClient, rowId: string) {
  const { error } = await supabase.from('profiles').delete().eq('id', rowId);
  if (error) throw error;
}

export async function updateEmployeeRow(
  supabase: SupabaseClient,
  profileId: string,
  input: UpdateEmployeeInput,
  updatedBy: string
): Promise<void> {
  const { data: dept } = await supabase
    .from('departments')
    .select('id')
    .eq('name', input.department)
    .maybeSingle();

  // Serialise academic entries as JSON into the profiles.education text column
  const educationJson = input.cvAcademic && input.cvAcademic.length > 0
    ? JSON.stringify(input.cvAcademic)
    : null;

  const updateFields: any = {
    full_name: input.name,
    email: input.email,
    role_title: toUpperCaseText(input.currentPosition ?? input.role),
    department_id: dept?.id ?? null,
    education: educationJson,
    summary: input.summary ?? null,
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
  };

  const details = normalizeEmployeeDetails(input);
  for (const field of employeeDetailFields) {
    if (details[field.key] !== undefined) updateFields[field.column] = details[field.key];
  }
  // Only update avatar_url if a new one was uploaded
  if (input.avatarUrl !== undefined && input.avatarUrl !== null) {
    updateFields.avatar_url = input.avatarUrl;
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update(updateFields)
    .eq('id', profileId);

  if (profileError) throw profileError;

  // Clear existing related records
  const { error: clearExpError } = await supabase.from('experiences').delete().eq('profile_id', profileId);
  if (clearExpError) throw clearExpError;

  const { error: clearProjError } = await supabase.from('projects').delete().eq('profile_id', profileId);
  if (clearProjError) throw clearProjError;

  const { error: clearCertError } = await supabase.from('certifications').delete().eq('profile_id', profileId);
  if (clearCertError) throw clearCertError;

  // Insert new related records
  if (input.cvExperience && input.cvExperience.length > 0) {
    await insertExperiences(supabase, profileId, input.cvExperience);
  }

  if (input.specialProjects && input.specialProjects.length > 0) {
    await insertProjects(supabase, profileId, input.specialProjects);
  }

  if (input.cvCertifications && input.cvCertifications.length > 0) {
    await insertCertifications(supabase, profileId, input.cvCertifications);
  }
}

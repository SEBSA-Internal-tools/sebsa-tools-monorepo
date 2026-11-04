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
  experiences ( company, role_title, employment_type, start_date, end_date, period_text, is_current, description, display_order ),
  projects ( name, description, skills, display_order ),
  certifications ( name, issuer, issued_date, display_order )
`;

export async function listEmployeeRows(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('profiles')
    .select(LIST_SELECT)
    .eq('status', 'published')
    .is('deleted_at', null)
    .order('full_name', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function getEmployeeRowById(supabase: SupabaseClient, profileId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select(DETAIL_SELECT)
    .eq('id', profileId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw error;
  return data;
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

function isoDate(year: number, month: number, day: number): string | null {
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const value = new Date(Date.UTC(year, month - 1, day));
  if (value.getUTCFullYear() !== year || value.getUTCMonth() !== month - 1 || value.getUTCDate() !== day) {
    return null;
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Extracts only dates whose day, month, and year are explicitly present in the CV text. */
function extractExactDates(period: string): string[] {
  const candidates: Array<{ index: number; value: string }> = [];
  const patterns: Array<{
    regex: RegExp;
    parts: (match: RegExpExecArray) => [number, number, number];
  }> = [
    {
      regex: /\b(19\d{2}|20\d{2}|2100)[-/.](\d{1,2})[-/.](\d{1,2})\b/g,
      parts: (match) => [Number(match[1]), Number(match[2]), Number(match[3])],
    },
    {
      // CVs in this application use day-first numeric dates (for example 31/12/2024).
      regex: /\b(\d{1,2})[/.](\d{1,2})[/.](19\d{2}|20\d{2}|2100)\b/g,
      parts: (match) => [Number(match[3]), Number(match[2]), Number(match[1])],
    },
    {
      regex: /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s*,?\s*(19\d{2}|20\d{2}|2100)\b/gi,
      parts: (match) => [Number(match[3]), MONTHS[match[2].toLowerCase()], Number(match[1])],
    },
    {
      regex: /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\s*,?\s*(19\d{2}|20\d{2}|2100)\b/gi,
      parts: (match) => [Number(match[3]), MONTHS[match[1].toLowerCase()], Number(match[2])],
    },
  ];

  for (const { regex, parts } of patterns) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(period)) !== null) {
      const value = isoDate(...parts(match));
      if (value) candidates.push({ index: match.index, value });
    }
  }

  return candidates
    .sort((left, right) => left.index - right.index)
    .filter((candidate, index, all) => index === 0 || candidate.index !== all[index - 1].index)
    .map((candidate) => candidate.value);
}

/**
 * Parses exact dates without inventing month/day values. The original period is stored separately
 * so values such as "Jun 2020 – Sep 2023" remain lossless even though PostgreSQL `date` cannot
 * represent month-only precision.
 */
export function parseExperiencePeriod(period: string): {
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
} {
  if (!period) return { startDate: null, endDate: null, isCurrent: false };

  const isCurrent =
    /present|current|now/i.test(period) || period.trim().endsWith('–') || period.trim().endsWith('-');

  const exactDates = extractExactDates(period);

  return {
    startDate: exactDates[0] ?? null,
    endDate: !isCurrent ? exactDates[1] ?? null : null,
    isCurrent,
  };
}

/** Converts a year string like "2022" into an ISO date string "2022-01-01". */
function yearToDate(year: string): string | null {
  const y = parseInt(year, 10);
  if (isNaN(y) || y < 1900 || y > 2100) return null;
  return `${y}-01-01`;
}

function validateCertifications(certifications: CvCertificationEntry[] | undefined): void {
  (certifications ?? []).forEach((certification, index) => {
    if (!certification.name.trim() || !certification.issuer.trim() || !certification.year.trim()) {
      throw new Error(`Certification ${index + 1} must include a name, issuer, and year.`);
    }
    if (!yearToDate(certification.year.trim())) {
      throw new Error(`Certification ${index + 1} must use a valid year between 1900 and 2100.`);
    }
  });
}

export async function createEmployeeRow(
  supabase: SupabaseClient,
  input: CreateEmployeeInput,
  createdBy: string
): Promise<string> {
  validateCertifications(input.cvCertifications);
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
    const { startDate, endDate, isCurrent } = parseExperiencePeriod(exp.period);
    return {
      profile_id: profileId,
      role_title: toTitleCase(exp.position),
      company: exp.company,
      employment_type: 'Full-time',
      start_date: startDate,
      end_date: endDate,
      period_text: exp.period.trim() || null,
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
  const rows = certs.map((c, index) => {
    const name = c.name.trim();
    const issuer = c.issuer.trim();
    const year = c.year.trim();
    const issuedDate = yearToDate(year);
    if (!name || !issuer || !year) {
      throw new Error(`Certification ${index + 1} must include a name, issuer, and year.`);
    }
    if (!issuedDate) {
      throw new Error(`Certification ${index + 1} must use a valid year between 1900 and 2100.`);
    }

    return {
      profile_id: profileId,
      name,
      issuer,
      issued_date: issuedDate,
      display_order: index,
    };
  });

  const { error } = await supabase.from('certifications').insert(rows);
  if (error) throw error;
}



export async function deleteEmployeeRow(
  supabase: SupabaseClient,
  rowId: string,
  deletedBy: string
) {
  const { data: existing, error: lookupError } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', rowId)
    .is('deleted_at', null)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (!existing) throw new Error('Employee profile was not found or has already been deleted.');

  const { error } = await supabase
    .from('profiles')
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: deletedBy,
      updated_at: new Date().toISOString(),
    })
    .eq('id', rowId)
    .is('deleted_at', null);
  if (error) throw error;
}

export async function updateEmployeeRow(
  supabase: SupabaseClient,
  profileId: string,
  input: UpdateEmployeeInput,
  updatedBy: string
): Promise<void> {
  validateCertifications(input.cvCertifications);
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
    .eq('id', profileId)
    .is('deleted_at', null);

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

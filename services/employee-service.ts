import { employeeDetailsFromRow } from '@/lib/employeeDetails';
import type { UpdateEmployeeInput } from '@/types/domain';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createEmployeeRow,
  deleteEmployeeRow,
  getEmployeeRowById,
  listEmployeeRows,
  updateEmployeeRow,
} from '@/repositories/employee-repository';
import type {
  CreateEmployeeInput,
  Employee,
  EmployeeExperience,
  EmployeeProject,
} from '@/types/domain';
import type { CvAcademicEntry, CvExperienceEntry, CvProjectEntry, CvCertificationEntry } from '@/lib/cvTypes';
import { getSignedAvatarUrl, DEFAULT_AVATAR } from '@/lib/avatar';
import { toTitleCase, toUpperCaseText } from '@/lib/text';

function formatDate(value: string | null | undefined): string {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
}

function formatExperiencePeriod(experience: {
  period_text?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  is_current?: boolean;
}): string {
  if (experience.period_text?.trim()) return experience.period_text.trim();
  return `${formatDate(experience.start_date) || 'N/A'} — ${
    experience.is_current ? 'Present' : formatDate(experience.end_date) || 'N/A'
  }`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapListRow(row: any): Employee {
  return {
    rowId: row.id,
    name: row.full_name,
    displayName: row.display_name ?? null,
    email: row.email,
    role: toUpperCaseText(row.role_title ?? ''),
    experienceYears:
      row.years_experience != null ? `${row.years_experience}+ Years Experience` : undefined,
    department: row.departments?.name ?? 'Unassigned',
    skills: [],
    lastUpdated: formatDate(row.updated_at),
    avatar: row.avatar_url ?? DEFAULT_AVATAR,
    isAccountLinked: row.user_id != null,
    accountUserId: row.user_id ?? null,
  };
}

/**
 * Safely attempts to parse a JSON string. Returns null if the string is not
 * valid JSON or is a plain text value (legacy).
 */
function tryParseJson<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed as T;
  } catch {
    return null;
  }
}

export async function listEmployees(supabase: SupabaseClient): Promise<Employee[]> {
  const rows = await listEmployeeRows(supabase);
  const mapped = rows.map(mapListRow);
  await Promise.all(
    mapped.map(async (emp) => {
      emp.avatar = await getSignedAvatarUrl(supabase, emp.avatar);
    })
  );
  return mapped;
}

export async function getEmployeeById(
  supabase: SupabaseClient,
  profileId: string
): Promise<Employee | null> {
  const row = await getEmployeeRowById(supabase, profileId);
  if (!row) return null;

  // ── Legacy experience mapping (with JSON tasks fallback) ──────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const experience: EmployeeExperience[] = ((row as any).experiences ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .sort((a: any, b: any) => a.display_order - b.display_order)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((e: any) => ({
      role: toTitleCase(e.role_title),
      company: e.company,
      type: e.employment_type ?? 'Full-time',
      period: formatExperiencePeriod(e),
      // desc is the serialised tasks array or free text
      desc: (() => {
        const tasks = tryParseJson<string[]>(e.description);
        return Array.isArray(tasks) ? tasks.join(' • ') : (e.description ?? '');
      })(),
    }));

  // ── Structured CV experience mapping ─────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cvExperience: CvExperienceEntry[] = ((row as any).experiences ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .sort((a: any, b: any) => a.display_order - b.display_order)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((e: any) => {
      const tasks = tryParseJson<string[]>(e.description);
      return {
        position: toTitleCase(e.role_title),
        company: e.company,
        period: formatExperiencePeriod(e),
        tasks: Array.isArray(tasks) ? tasks : (e.description ? [e.description] : []),
      };
    });

  // ── Projects mapping ──────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const projects: EmployeeProject[] = ((row as any).projects ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .sort((a: any, b: any) => a.display_order - b.display_order)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((p: any) => ({ name: p.name, desc: p.description ?? '' }));

  // ── Structured special projects mapping ───────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const specialProjects: CvProjectEntry[] = ((row as any).projects ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .sort((a: any, b: any) => a.display_order - b.display_order)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((p: any) => ({ title: p.name, brief: p.description ?? '', skills: p.skills ?? [] }));

  // ── Certifications mapping ────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const certs: string[] = ((row as any).certifications ?? []).map((c: any) =>
    [c.name, c.issuer ? `(${c.issuer}${c.issued_date ? ` • ${new Date(c.issued_date).getFullYear()}` : ''})` : null]
      .filter(Boolean)
      .join(' ')
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cvCertifications: CvCertificationEntry[] = ((row as any).certifications ?? []).map((c: any) => ({
    name: c.name,
    issuer: c.issuer ?? '',
    year: c.issued_date ? String(new Date(c.issued_date).getFullYear()) : '',
  }));

  // ── Academic mapping ──────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawEducation: string | null = (row as any).education ?? null;
  const cvAcademic: CvAcademicEntry[] = tryParseJson<CvAcademicEntry[]>(rawEducation) ?? [];
  // Legacy plain-text education field (non-JSON)
  const educationText = cvAcademic.length === 0 ? (rawEducation ?? undefined) : undefined;

  const emp = {
    ...mapListRow(row),
    ...employeeDetailsFromRow(row as unknown as Record<string, unknown>),
    experience: experience.length > 0 ? experience : undefined,
    projects: projects.length > 0 ? projects : undefined,
    certs: certs.length > 0 ? certs : undefined,
    education: educationText,
    // Structured fields
    cvExperience: cvExperience.length > 0 ? cvExperience : undefined,
    specialProjects: specialProjects.length > 0 ? specialProjects : undefined,
    cvCertifications: cvCertifications.length > 0 ? cvCertifications : undefined,
    cvAcademic: cvAcademic.length > 0 ? cvAcademic : undefined,
    currentPosition: (row as any).role_title ? toUpperCaseText((row as any).role_title) : undefined,
    summary: (row as any).summary ?? undefined,
    status: (row as any).status ?? undefined,
    hasPendingChange: (row as any).pending_change != null,
  };
  emp.avatar = await getSignedAvatarUrl(supabase, emp.avatar);
  return emp;
}

export async function createEmployee(
  supabase: SupabaseClient,
  input: CreateEmployeeInput,
  createdBy: string
): Promise<string> {
  return createEmployeeRow(supabase, input, createdBy);
}

export async function deleteEmployee(
  supabase: SupabaseClient,
  rowId: string,
  deletedBy: string
): Promise<void> {
  await deleteEmployeeRow(supabase, rowId, deletedBy);
}

export async function updateEmployee(
  supabase: SupabaseClient,
  profileId: string,
  input: UpdateEmployeeInput,
  updatedBy: string
): Promise<void> {
  await updateEmployeeRow(supabase, profileId, input, updatedBy);
}

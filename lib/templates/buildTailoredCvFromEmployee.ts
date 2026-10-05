import type { Employee, CreateEmployeeInput } from '@/types/domain';
import type { TailoredCv } from '@/app/(authenticated)/generate/types';

/**
 * Converts an already-loaded (RLS-scoped) `Employee` straight into the `TailoredCv` shape that
 * `CvPreviewTemplate`/`lib/cvExport.ts` render and export, with no AI tailoring step — used for
 * the "preview & download my own CV" feature (repository/[id]) rather than the Admin/Super Admin
 * "Customize CVs" wizard (app/(authenticated)/generate/), which produces a `TailoredCv` via
 * Gemini instead. `customerName` is left blank on purpose — the Handlebars template
 * (`lib/templates/cvTemplate.ts`) simply omits that line when empty. `summary` now comes from the
 * employee's own Objective field (profiles.summary) rather than always being blank.
 *
 * Prefers the structured Gemini-parsed fields (cvExperience/cvAcademic/specialProjects/
 * cvCertifications); falls back to the legacy demo-data shapes for the handful of
 * pre-seeded/older profiles that never went through the parsing pipeline.
 */
export function buildTailoredCvFromEmployee(employee: Employee): TailoredCv {
  const experience =
    employee.cvExperience && employee.cvExperience.length > 0
      ? employee.cvExperience
      : (employee.experience ?? []).map((exp) => ({
          position: exp.role,
          company: exp.company,
          period: exp.period,
          tasks: exp.desc ? [exp.desc] : [],
        }));

  const specialProjects =
    employee.specialProjects && employee.specialProjects.length > 0
      ? employee.specialProjects
      : (employee.projects ?? []).map((proj) => ({
          title: proj.name,
          brief: proj.desc,
          skills: [],
        }));

  const certifications =
    employee.cvCertifications && employee.cvCertifications.length > 0
      ? employee.cvCertifications
      : (employee.certs ?? []).map((cert) => ({ name: cert, issuer: '', year: '' }));

  // No legacy equivalent for structured academic entries — `employee.education` is a single
  // free-text string, not a list, so there's nothing sensible to fall back to.
  const academic = employee.cvAcademic ?? [];

  return {
    name: employee.name,
    currentPosition: employee.currentPosition || employee.role,
    summary: employee.summary ?? '',
    customerName: '',
    skillsAligned: employee.skills,
    experience,
    academic,
    specialProjects,
    certifications,
    avatar: employee.avatar,
  };
}

/** The subset of TailoredCv a user has picked to include — same shape whether the picker was a
 *  human (Download CV, no AI) or an AI suggestion the human then adjusted (Customize CVs). */
export interface TailoredCvSelection {
  summary: string;
  academic: TailoredCv['academic'];
  experience: TailoredCv['experience'];
  specialProjects: TailoredCv['specialProjects'];
  certifications: TailoredCv['certifications'];
}

/**
 * Merges a selected-content payload with the employee's identity fields into a full TailoredCv —
 * shared by the Customize CVs flow (AI-suggested, human-adjusted selection) and the Download CV
 * flow (human-only selection, no AI involved) so both ever only differ in how `selection` was
 * produced, never in how it's turned into the thing that gets previewed/exported/saved.
 */
export function buildTailoredCvFromSelection(
  employee: Employee,
  customerName: string,
  selection: TailoredCvSelection
): TailoredCv {
  return {
    name: employee.name,
    currentPosition: employee.currentPosition || employee.role,
    summary: selection.summary,
    customerName,
    skillsAligned: [],
    academic: selection.academic,
    experience: selection.experience,
    specialProjects: selection.specialProjects,
    certifications: selection.certifications,
    avatar: employee.avatar,
  };
}

/** Creates an export-only anonymous copy. The source object and persisted CV/profile stay intact. */
export function anonymizeTailoredCv(cv: TailoredCv): TailoredCv {
  const initials = cv.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((namePart) => namePart.charAt(0).toUpperCase())
    .join('');

  return {
    ...cv,
    name: initials,
    avatar: null,
  };
}

/**
 * Converts a proposed-but-not-yet-approved edit (`profiles.pending_change`, a full
 * `CreateEmployeeInput` — see app/(authenticated)/my-profile/actions.ts) into `TailoredCv` so a
 * reviewer can preview it in the real CV template before approving, at /review
 * (docs/04-rbac-security.md §12) — same rendering path as buildTailoredCvFromEmployee above, just
 * fed from the proposed input instead of the live profile row.
 *
 * `fallbackAvatarUrl` should be the profile's CURRENT (already-live) photo — `input.avatarUrl` is
 * only ever set when the employee actually uploaded a replacement photo as part of this proposal
 * (ProfileChangeSubmission's doc comment: "Omit to leave the current photo unchanged"), so most
 * proposals have no avatarUrl of their own and would otherwise preview with no photo at all.
 */
export function buildTailoredCvFromInput(
  input: CreateEmployeeInput,
  fallbackAvatarUrl?: string | null
): TailoredCv {
  return {
    name: input.name,
    currentPosition: input.currentPosition || input.role,
    summary: input.summary ?? '',
    customerName: '',
    skillsAligned: input.skills,
    experience: input.cvExperience ?? [],
    academic: input.cvAcademic ?? [],
    specialProjects: input.specialProjects ?? [],
    certifications: input.cvCertifications ?? [],
    avatar: input.avatarUrl ?? fallbackAvatarUrl ?? null,
  };
}

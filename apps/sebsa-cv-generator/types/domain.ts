import type { EmployeeDetails } from '@/lib/employeeDetails';
import type { AccountStatus } from '@/lib/accountStatus';
import type {
  CvExperienceEntry,
  CvAcademicEntry,
  CvProjectEntry,
  CvCertificationEntry,
} from '@/lib/cvTypes';

/**
 * UI-facing employee shape. Deliberately mirrors the original DataContext `Employee` type so the
 * existing pages/JSX don't need restructuring — only their data source changes. `rowId` (the
 * profiles.id uuid) is the sole identifier — used for routing, list keys, and mutations alike.
 * Profiles previously also had a human-readable `employee_code` (e.g. "EMP-00124") used for
 * routing/display, but it was pure redundancy alongside `id` and has been removed (migration
 * 0022_remove_employee_code.sql).
 *
 * Structured CV fields (experience, academic, specialProjects, certifications) are added to
 * support the Gemini parsing pipeline introduced in Phase 5.
 */

// Legacy experience shape — still used by getEmployeeById for database-fetched profiles
export interface EmployeeExperience {
  role: string;
  company: string;
  type: string;
  period: string;
  desc: string;
}

// Legacy project shape — still used by getEmployeeById for database-fetched profiles
export interface EmployeeProject {
  name: string;
  desc: string;
}

// Re-export CV types for convenience in service / repository layers
export type { CvExperienceEntry, CvAcademicEntry, CvProjectEntry, CvCertificationEntry };

export interface Employee extends EmployeeDetails {
  rowId: string;
  name: string;
  email: string;
  role: string;
  experienceYears?: string;
  department: string;
  skills: string[];
  lastUpdated: string;
  avatar: string;
  /** True once this profile is linked to a real login (self-claimed or self-registered). */
  isAccountLinked: boolean;
  /** `profiles.user_id`. Server-side only — pages strip it before handing the Employee to a
   *  Client Component, since the browser needs the derived status, not the auth id. */
  accountUserId?: string | null;
  /** Login lifecycle state, derived from Supabase Auth by services/account-service.ts rather
   *  than stored on the row. Only populated by callers that enrich it (the repository list and
   *  detail pages); undefined elsewhere. */
  accountStatus?: AccountStatus;
  /** Only populated by getEmployeeById (detail view) — listEmployees always returns 'published'. */
  status?: 'draft' | 'published' | 'archived';
  hasPendingChange?: boolean;
  /** Latest complete employee-submitted snapshot waiting for review. Live profile fields remain
   * unchanged until approval. Only populated by the detail service. */
  pendingChange?: UpdateEmployeeInput;
  pendingChangeSubmittedAt?: string | null;
  pendingChangeVersion?: string | null;
  /** Display URL for a staged replacement photo; pendingChange.avatarUrl remains the stored path. */
  pendingChangeAvatar?: string;

  // Legacy optional fields (populated from Supabase for existing employees)
  experience?: EmployeeExperience[];
  projects?: EmployeeProject[];
  certs?: string[];
  education?: string;

  // Structured CV fields (populated from Gemini-parsed CVs)
  cvExperience?: CvExperienceEntry[];
  cvAcademic?: CvAcademicEntry[];
  specialProjects?: CvProjectEntry[];
  cvCertifications?: CvCertificationEntry[];
  currentPosition?: string;
  /** Objective / professional summary — profiles.summary column. */
  summary?: string;
}

export interface CreateEmployeeInput extends EmployeeDetails {
  name: string;
  email: string;
  role: string;
  department: string;
  skills: string[];

  // Optional structured CV fields — populated from Gemini parsing pipeline
  currentPosition?: string;
  /** Objective / professional summary — profiles.summary column. */
  summary?: string;
  cvExperience?: CvExperienceEntry[];
  cvAcademic?: CvAcademicEntry[];
  specialProjects?: CvProjectEntry[];
  cvCertifications?: CvCertificationEntry[];

  // Profile picture URL — stored in Supabase Storage profile-pictures bucket
  avatarUrl?: string;

  // Set only by the self-service /onboarding flow (see app/onboarding/actions.ts). Links the new
  // profile to the creating auth user and forces status='draft' regardless of caller — admin/
  // reviewer-created profiles never set this and stay 'published' immediately, matching existing
  // behavior (docs/04-rbac-security.md §0.2 — full maker-checker review isn't built yet).
  selfServiceUserId?: string;

  // Set by createEmployeeAction (docs/04-rbac-security.md §14) after provisioning/inviting an
  // Auth account for an Admin/Reviewer-added employee. Unlike selfServiceUserId, this does NOT
  // force status='draft' — an Admin adding someone doesn't need to self-approve their own action.
  linkedUserId?: string;
}

export type UpdateEmployeeInput = CreateEmployeeInput & EmployeeDetails;

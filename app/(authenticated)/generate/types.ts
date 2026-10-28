import type { CvAcademicEntry, CvProfile } from '@/lib/cvTypes';

export type CvTemplateId = 'template1' | 'template2';

export interface TailoredCv extends CvProfile {
  summary: string;           // AI-generated executive summary or description
  customerName: string;      // Target opportunity
  skillsAligned: string[];   // Merged required + profile skills
  avatar?: string | null;    // Employee avatar image URL
  /** Saved with generated CV content; older CVs without it render with Template 1. */
  templateId?: CvTemplateId;
  /** False when the user explicitly excludes Education; omitted values remain included. */
  includeEducation?: boolean;
}

// ─── AI content-selection suggestion (Customize CVs flow) ─────────────────────
//
// The AI only ever returns relevance flags + index references (see
// app/(authenticated)/generate/actions.ts's suggestCvContentAction) — it never returns text for
// these fields. The server resolves those flags against the employee's real profile data before
// this shape is ever built, so every `text`/`title`/`brief`/etc. value here is guaranteed to have
// come from the profile, not from the model. `objective` is the sole exception: it's the one
// field the AI is allowed to generate, per the "selector, not creator" rule.

export interface CvSuggestionTask {
  index: number;
  text: string;
  relevant: boolean;
}

export interface CvSuggestionSkill {
  index: number;
  text: string;
  relevant: boolean;
}

export interface CvSuggestionExperience {
  index: number;
  position: string;
  company: string;
  period: string;
  relevant: boolean;
  tasks: CvSuggestionTask[];
}

export interface CvSuggestionProject {
  index: number;
  title: string;
  brief: string;
  relevant: boolean;
  skills: CvSuggestionSkill[];
}

export interface CvSuggestionCertification {
  index: number;
  name: string;
  issuer: string;
  year: string;
  relevant: boolean;
}

export interface CvSuggestion {
  /** The employee's original profile Objective/Summary, preserved verbatim for comparison. */
  originalObjective: string;
  /** AI-generated, customized Objective — the only free-text content the AI produces. */
  objective: string;
  /** Verbatim from the profile; the client lets users include or exclude individual entries. */
  academic: CvAcademicEntry[];
  experience: CvSuggestionExperience[];
  projects: CvSuggestionProject[];
  certifications: CvSuggestionCertification[];
}

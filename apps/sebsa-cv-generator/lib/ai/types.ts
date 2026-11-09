/**
 * Provider-agnostic shapes. Both GeminiProvider and ClaudeProvider must return exactly these —
 * nothing downstream (services/, app/) should ever need to branch on which provider ran.
 * See docs/05-ai-provider-abstraction.md.
 */

export interface ExtractedExperience {
  company: string;
  roleTitle: string;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  description: string;
}

export interface ExtractedProject {
  name: string;
  description: string;
  tags: string[];
}

export interface ExtractedCertification {
  name: string;
  issuer: string | null;
  issuedDate: string | null;
}

export interface EmployeeProfileExtraction {
  fullName: string;
  email: string | null;
  phone: string | null;
  roleTitle: string | null;
  location: string | null;
  yearsExperience: number | null;
  summary: string | null;
  skills: string[];
  experiences: ExtractedExperience[];
  projects: ExtractedProject[];
  certifications: ExtractedCertification[];
  education: string | null;
  /** Surfaced in the manual-review UI so a human knows what to double-check. */
  confidence: 'high' | 'medium' | 'low';
}

export interface RequirementExtraction {
  customerName: string | null;
  projectName: string | null;
  requiredSkills: string[];
  requiredExperienceYears: number | null;
  industryDomain: string | null;
  keyCompetencies: string[];
  preferredCertifications: string[];
  keywords: string[];
  mandatoryRequirements: string[];
}

export interface CvCustomizationInput {
  profile: EmployeeProfileExtraction & { profileId: string };
  requirement: RequirementExtraction & { opportunityId: string };
}

export type AiHighlightSource = 'reordered' | 'reworded' | 'emphasized';

export interface CustomizedCvResult {
  summary: string;
  orderedSkills: string[];
  orderedExperiences: Array<{
    experienceRef: string;
    emphasis: 'high' | 'medium' | 'low';
    rewrittenDescription: string;
  }>;
  orderedProjects: Array<{ projectRef: string; emphasis: 'high' | 'medium' | 'low' }>;
  aiHighlights: Record<string, { reason: string; source: AiHighlightSource }>;
}

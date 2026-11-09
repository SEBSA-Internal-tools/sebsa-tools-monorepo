/**
 * Shared TypeScript interfaces for the structured CV parsing pipeline.
 * Used by the Gemini API route (server), the upload page form (client),
 * and the DataContext addEmployee flow.
 */

export interface CvExperienceEntry {
  position: string;
  company: string;
  period: string;
  tasks: string[];
}

export interface CvAcademicEntry {
  qualification: string;
  institution: string;
  period: string;
}

export interface CvProjectEntry {
  title: string;
  brief: string;
  skills: string[];
}

export interface CvCertificationEntry {
  name: string;
  issuer: string;
  year: string;
}

export function isCertificationComplete(certification: CvCertificationEntry): boolean {
  return Boolean(
    certification.name.trim()
    && certification.issuer.trim()
    && certification.year.trim()
  );
}

export function getCertificationsValidationError(certifications: CvCertificationEntry[]): string | null {
  const incompleteIndex = certifications.findIndex((certification) => !isCertificationComplete(certification));
  return incompleteIndex === -1
    ? null
    : `Certification ${incompleteIndex + 1} must include a name, issuer, and year.`;
}

export interface CvProfile {
  name: string;
  currentPosition: string;
  /** Objective / professional summary — freeform, shown as the "Objective" section in the CV
   *  template. Optional: profiles created before this field existed simply have none. */
  summary: string;
  experience: CvExperienceEntry[];
  academic: CvAcademicEntry[];
  specialProjects: CvProjectEntry[];
  certifications: CvCertificationEntry[];
}

/** Returns a blank CvProfile — used to seed the edit form before parsing. */
export function emptyCvProfile(): CvProfile {
  return {
    name: '',
    currentPosition: '',
    summary: '',
    experience: [],
    academic: [],
    specialProjects: [],
    certifications: [],
  };
}

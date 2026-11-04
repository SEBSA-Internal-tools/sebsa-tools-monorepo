import type { CvProfile } from '@/lib/cvTypes';
import type {
  CvRecommendationResult,
  RecommendedCertification,
  RecommendedExperience,
  RecommendedProject,
  RecommendedPoint,
  RecommendedProjectSkill,
} from '@/lib/cv-recommendations';

export type CvTemplateId = 'template1' | 'template2';

export interface TailoredCv extends CvProfile {
  summary: string;
  customerName: string;
  skillsAligned: string[];
  avatar?: string | null;
  templateId?: CvTemplateId;
  includeEducation?: boolean;
}

export type CvSuggestionTask = RecommendedPoint;
export type CvSuggestionSkill = RecommendedProjectSkill;
export type CvSuggestionExperience = RecommendedExperience;
export type CvSuggestionProject = RecommendedProject;
export type CvSuggestionCertification = RecommendedCertification;
export type CvSuggestion = CvRecommendationResult;

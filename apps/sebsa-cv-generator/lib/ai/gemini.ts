import { GoogleGenerativeAI } from '@google/generative-ai';
import { requireEnv } from '@/lib/env';
import type { AIProvider } from '@/lib/ai/provider';
import type {
  CustomizedCvResult,
  CvCustomizationInput,
  EmployeeProfileExtraction,
  RequirementExtraction,
} from '@/lib/ai/types';

/**
 * Active MVP provider (docs/05-ai-provider-abstraction.md). The three methods here are stubs
 * scaffolded in Phase 1 — real prompts/schemas land in Phases 5, 6, and 7 respectively as each
 * capability is built, per the "don't implement everything at once" instruction.
 */
export class GeminiProvider implements AIProvider {
  private client: GoogleGenerativeAI | null = null;

  private getClient(): GoogleGenerativeAI {
    if (!this.client) {
      this.client = new GoogleGenerativeAI(requireEnv('GEMINI_API_KEY'));
    }
    return this.client;
  }

  async extractEmployeeProfile(_rawCvText: string): Promise<EmployeeProfileExtraction> {
    this.getClient();
    throw new Error('GeminiProvider.extractEmployeeProfile is implemented in Phase 5 (CV upload & parsing).');
  }

  async extractRequirement(_rawDocumentText: string): Promise<RequirementExtraction> {
    this.getClient();
    throw new Error('GeminiProvider.extractRequirement is implemented in Phase 6 (requirement upload & parsing).');
  }

  async generateCustomizedCV(_input: CvCustomizationInput): Promise<CustomizedCvResult> {
    this.getClient();
    throw new Error('GeminiProvider.generateCustomizedCV is implemented in Phase 7 (AI CV customization engine).');
  }
}

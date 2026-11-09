import Anthropic from '@anthropic-ai/sdk';
import { requireEnv } from '@/lib/env';
import type { AIProvider } from '@/lib/ai/provider';
import type {
  CustomizedCvResult,
  CvCustomizationInput,
  EmployeeProfileExtraction,
  RequirementExtraction,
} from '@/lib/ai/types';

/**
 * Future provider (docs/05-ai-provider-abstraction.md). Implements the same AIProvider contract
 * as GeminiProvider so switching AI_PROVIDER=claude is a config change, not a rewrite. Not wired
 * as the active provider and not implemented until the team has Claude API access — the stubs
 * below exist to prove the interface holds, not as a Phase-1 deliverable.
 */
export class ClaudeProvider implements AIProvider {
  private client: Anthropic | null = null;

  private getClient(): Anthropic {
    if (!this.client) {
      this.client = new Anthropic({ apiKey: requireEnv('CLAUDE_API_KEY') });
    }
    return this.client;
  }

  async extractEmployeeProfile(_rawCvText: string): Promise<EmployeeProfileExtraction> {
    this.getClient();
    throw new Error('ClaudeProvider.extractEmployeeProfile is not yet implemented — see docs/05-ai-provider-abstraction.md.');
  }

  async extractRequirement(_rawDocumentText: string): Promise<RequirementExtraction> {
    this.getClient();
    throw new Error('ClaudeProvider.extractRequirement is not yet implemented — see docs/05-ai-provider-abstraction.md.');
  }

  async generateCustomizedCV(_input: CvCustomizationInput): Promise<CustomizedCvResult> {
    this.getClient();
    throw new Error('ClaudeProvider.generateCustomizedCV is not yet implemented — see docs/05-ai-provider-abstraction.md.');
  }
}

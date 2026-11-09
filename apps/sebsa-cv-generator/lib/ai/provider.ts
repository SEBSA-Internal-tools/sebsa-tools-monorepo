import { env } from '@/lib/env';
import { ClaudeProvider } from '@/lib/ai/claude';
import { GeminiProvider } from '@/lib/ai/gemini';
import type {
  CustomizedCvResult,
  CvCustomizationInput,
  EmployeeProfileExtraction,
  RequirementExtraction,
} from '@/lib/ai/types';

/**
 * The only contract business logic is allowed to depend on. Never import GeminiProvider or
 * ClaudeProvider directly outside this file — see docs/05-ai-provider-abstraction.md.
 */
export interface AIProvider {
  extractEmployeeProfile(rawCvText: string): Promise<EmployeeProfileExtraction>;
  extractRequirement(rawDocumentText: string): Promise<RequirementExtraction>;
  generateCustomizedCV(input: CvCustomizationInput): Promise<CustomizedCvResult>;
}

let cachedProvider: AIProvider | null = null;

/**
 * Resolves the active provider from `AI_PROVIDER`. Swapping Gemini for Claude later is a config
 * change (`AI_PROVIDER=claude` + `CLAUDE_API_KEY`), not a call-site change. Both provider classes
 * only touch their SDK client lazily inside methods, so constructing the unused one here is cheap
 * and never requires the other provider's API key.
 */
export function getAIProvider(): AIProvider {
  if (cachedProvider) return cachedProvider;

  cachedProvider = env.AI_PROVIDER === 'claude' ? new ClaudeProvider() : new GeminiProvider();

  return cachedProvider;
}

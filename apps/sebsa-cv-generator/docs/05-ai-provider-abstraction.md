# AI Provider Abstraction

## 1. Rule

**No business logic ever imports `gemini.ts` or `claude.ts` directly.** Everything goes through
`lib/ai/provider.ts`. Swapping Gemini for Claude later means implementing `ClaudeProvider` fully
and changing `AI_PROVIDER=gemini` to `AI_PROVIDER=claude` in the environment — zero call-site
changes anywhere in `services/` or `app/`.

## 2. Interface (`lib/ai/provider.ts`)

```ts
export interface AIProvider {
  extractEmployeeProfile(rawCvText: string): Promise<EmployeeProfileExtraction>;
  extractRequirement(rawDocumentText: string): Promise<RequirementExtraction>;
  generateCustomizedCV(input: CvCustomizationInput): Promise<CustomizedCvResult>;
}

export function getAIProvider(): AIProvider {
  const provider = env.AI_PROVIDER; // 'gemini' | 'claude'
  switch (provider) {
    case 'gemini': return new GeminiProvider();
    case 'claude': return new ClaudeProvider();
    default: throw new Error(`Unknown AI_PROVIDER: ${provider}`);
  }
}
```

## 3. Shared types (`lib/ai/types.ts`)

These are provider-agnostic — both Gemini and Claude implementations must return exactly this
shape, so the rest of the app never branches on which provider ran.

```ts
export interface EmployeeProfileExtraction {
  fullName: string;
  email: string | null;
  phone: string | null;
  roleTitle: string | null;
  location: string | null;
  yearsExperience: number | null;
  summary: string | null;
  skills: string[];
  experiences: Array<{
    company: string; roleTitle: string; startDate: string | null;
    endDate: string | null; isCurrent: boolean; description: string;
  }>;
  projects: Array<{ name: string; description: string; tags: string[] }>;
  certifications: Array<{ name: string; issuer: string | null; issuedDate: string | null }>;
  education: string | null;
  confidence: 'high' | 'medium' | 'low'; // surfaced in the manual-review UI
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

export interface CustomizedCvResult {
  summary: string;
  orderedSkills: string[];
  orderedExperiences: Array<{ experienceRef: string; emphasis: 'high'|'medium'|'low'; rewrittenDescription: string }>;
  orderedProjects: Array<{ projectRef: string; emphasis: 'high'|'medium'|'low' }>;
  aiHighlights: Record<string, { reason: string; source: 'reordered'|'reworded'|'emphasized' }>;
}
```

## 4. Anti-fabrication guardrail

Every `generateCustomizedCV` prompt includes a hard system-level constraint (not just a
suggestion) enumerated from the spec:

> Never invent or alter: company names, employment dates, job titles held, project names,
> certifications, awards, or any other objectively verifiable fact. You may reword, summarize,
> reorder, and emphasize existing factual content. If the requirement asks for something the
> profile has no evidence of, omit it — do not infer or fabricate it.

The service layer additionally **validates the AI's output against the source profile** after
the call returns: every `experienceRef`/`projectRef` in the result must match an ID that actually
exists on the profile; any reference to a company/cert/project name not present in the source
profile is rejected and the generation fails closed (surfaced to the user as an error, not
silently dropped), rather than trusting the model's self-restraint alone.

## 5. Gemini implementation (`lib/ai/gemini.ts`)

Uses `@google/generative-ai`. JSON-mode / structured output (`responseMimeType:
"application/json"` with a response schema) is used for all three methods so parsing is
deterministic rather than regex-scraping prose. Implemented in Phase 5/6/7 as each capability is
built, not in Phase 1.

## 6. Claude implementation (`lib/ai/claude.ts`)

Same interface, using the Anthropic SDK's tool-use or structured-output pattern for equivalent
JSON reliability. Not activated (no `CLAUDE_API_KEY` required) until the team has Claude API
access — the file exists so the swap is a config change, not a rewrite, and so code review can
confirm the abstraction actually holds (both implementations satisfy the same interface).

## 7. Environment variables

```
AI_PROVIDER=gemini        # 'gemini' | 'claude'
GEMINI_API_KEY=...        # required when AI_PROVIDER=gemini
CLAUDE_API_KEY=           # reserved, required only when AI_PROVIDER=claude
```

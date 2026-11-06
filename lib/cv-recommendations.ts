import { splitProjectDescription } from '@/lib/projectDescription';
import type { Employee } from '@/types/domain';

export interface RecommendationEvidence {
  score?: number;
  rank?: number;
  matchedRequiredSkills?: string[];
  matchedKeywords?: string[];
  reason?: string;
}

export interface RecommendedPoint extends RecommendationEvidence {
  index: number;
  text: string;
  relevant: boolean;
}

export interface RecommendedExperience extends RecommendationEvidence {
  index: number;
  position: string;
  company: string;
  period: string;
  relevant: boolean;
  tasks: RecommendedPoint[];
}

export interface RecommendedProjectSkill extends RecommendationEvidence {
  index: number;
  text: string;
  relevant: boolean;
}

export interface RecommendedProject extends RecommendationEvidence {
  index: number;
  title: string;
  brief: string;
  relevant: boolean;
  skills: RecommendedProjectSkill[];
  descriptionPoints: RecommendedPoint[];
}

export interface RecommendedCertification extends RecommendationEvidence {
  index: number;
  name: string;
  issuer: string;
  year: string;
  relevant: boolean;
}

export interface CvRecommendationResult {
  originalObjective: string;
  objective: string;
  academic: NonNullable<Employee['cvAcademic']>;
  normalizedRequirements: {
    requiredSkills: string[];
    keywords: string[];
  };
  experience: RecommendedExperience[];
  projects: RecommendedProject[];
  certifications: RecommendedCertification[];
}

interface RequirementTerm {
  label: string;
  canonical: string;
  kind: 'required' | 'keyword';
  weight: number;
}

interface Field {
  text: string;
  weight: number;
}

interface Evidence {
  score: number;
  matchedRequiredSkills: string[];
  matchedKeywords: string[];
  reason: string;
}

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'but', 'by', 'can', 'for', 'from',
  'has', 'have', 'in', 'into', 'is', 'it', 'of', 'on', 'or', 'our', 'should', 'that',
  'the', 'their', 'this', 'to', 'using', 'was', 'we', 'were', 'will', 'with', 'work',
  'working', 'experience', 'experienced', 'knowledge', 'preferred', 'required', 'skills',
  'skill', 'candidate', 'responsible', 'responsibilities', 'role', 'years', 'year',
]);

const ALIASES: Record<string, string> = {
  // Cloud
  'amazon web services': 'aws',
  'aws': 'aws',
  'microsoft azure': 'azure',
  'azure': 'azure',
  'google cloud platform': 'gcp',
  'google cloud': 'gcp',
  'gcp': 'gcp',

  // Languages
  'javascript': 'javascript',
  'java script': 'javascript',
  'js': 'javascript',

  'typescript': 'typescript',
  'type script': 'typescript',
  'ts': 'typescript',

  'c sharp': 'c#',
  'c#': 'c#',

  'cplusplus': 'c++',
  'c plus plus': 'c++',
  'c++': 'c++',

  // Node
  'nodejs': 'node.js',
  'node js': 'node.js',
  'node': 'node.js',
  'node.js': 'node.js',

  // React
  'reactjs': 'react',
  'react js': 'react',
  'react.js': 'react',
  'react': 'react',

  // Next
  'nextjs': 'next.js',
  'next js': 'next.js',
  'next.js': 'next.js',

  // .NET
  'dotnet': '.net',
  'dot net': '.net',
  '.net core': '.net',
  '.net': '.net',

  // Databases
  'postgres': 'postgresql',
  'postgresql': 'postgresql',

  'ms sql': 'sql server',
  'mssql': 'sql server',
  'microsoft sql server': 'sql server',
  'sql server': 'sql server',

  // DevOps
  'k8s': 'kubernetes',
  'kubernetes': 'kubernetes',

  'ci cd': 'ci/cd',
  'cicd': 'ci/cd',
  'ci/cd': 'ci/cd',

  // APIs
  'rest api': 'rest',
  'restful': 'rest',
  'rest': 'rest',

  // AI
  'machine learning': 'machine learning',
  'ml': 'machine learning',

  'artificial intelligence': 'ai',
  'ai': 'ai',

  // IFS Core
  'ifs': 'ifs',
  'ifs applications': 'ifs',
  'ifs app': 'ifs',
  'ifs cloud': 'ifs cloud',
  'erp': 'erp',
  'enterprise resource planning': 'erp',

  // Aurena
  'ifs aurena': 'aurena',
  'aurena': 'aurena',

  // Supply Chain
  'supply chain': 'supply chain',
  'scm': 'supply chain',
  'logistics': 'logistics',
  'distribution': 'distribution',

  // Manufacturing
  'manufacturing': 'manufacturing',
  'production planning': 'production planning',
  'mrp': 'material requirements planning',
  'material requirements planning': 'material requirements planning',
  'mps': 'master scheduling',
  'master scheduling': 'master scheduling',
  'capacity planning': 'capacity planning',
  'shop floor reporting': 'shop floor reporting',
  'sfr': 'shop floor reporting',

  // Procurement
  'procurement': 'procurement',
  'purchasing': 'procurement',
  'purchase orders': 'purchase orders',

  // Inventory
  'inventory': 'inventory management',
  'inventory management': 'inventory management',
  'warehouse management': 'warehouse management',
  'warehousing': 'warehouse management',

  // Finance
  'finance': 'finance',
  'financials': 'finance',

  'general ledger': 'general ledger',
  'gl': 'general ledger',

  'accounts payable': 'accounts payable',
  'ap': 'accounts payable',

  'accounts receivable': 'accounts receivable',
  'ar': 'accounts receivable',

  'fixed assets': 'fixed assets',
  'fa': 'fixed assets',

  'costing': 'costing',
  'budgeting': 'budgeting',
  'financial reporting': 'financial reporting',

  // Asset Management
  'eam': 'enterprise asset management',
  'enterprise asset management': 'enterprise asset management',
  'asset management': 'enterprise asset management',

  // Maintenance
  'maintenance management': 'maintenance management',
  'preventive maintenance': 'preventive maintenance',
  'cmms': 'maintenance management',

  'work order': 'work order',
  'work orders': 'work order',
  'wo': 'work order',
  'w/o': 'work order',

  // Service Management
  'fsm': 'field service management',
  'field service': 'field service management',
  'field service management': 'field service management',
  'service management': 'service management',

  // CRM & HR
  'crm': 'customer relationship management',
  'customer relationship management': 'customer relationship management',

  'hr': 'human resources',
  'human resources': 'human resources',

  // Projects
  'project management': 'project management',
  'pm': 'project management',

  'ppm': 'project portfolio management',
  'project portfolio management': 'project portfolio management',

  'pso': 'project supply orders',
  'project supply order': 'project supply orders',
  'project supply orders': 'project supply orders',

  // WADACO
  'wadaco': 'wadaco',
  'ifs wadaco': 'wadaco',
  'mobile workforce': 'wadaco',
  'barcode scanning': 'wadaco',
  'barcode': 'wadaco',
  'rfid': 'rfid',

  // Integration
  'integration': 'integration',
  'api integration': 'integration',
  'api': 'api integration',

  'odata': 'odata',

  'web services': 'web services',
  'soap': 'web services',

  'middleware': 'middleware',
  'esb': 'middleware',

  'boomi': 'boomi',
  'dell boomi': 'boomi',

  'etl': 'data migration',
  'iot': 'internet of things',

  // Technical
  'oracle': 'oracle',
  'oracle database': 'oracle',

  'sql': 'sql',

  'plsql': 'pl/sql',
  'pl/sql': 'pl/sql',

  'customization': 'customization',
  'customizations': 'customization',

  'configuration': 'configuration',

  'extension': 'extension',
  'extensions': 'extension',

  // IFS Development
  'projection': 'projection',
  'projections': 'projection',
  'aurena projection': 'projection',

  'custom field': 'custom field',
  'custom fields': 'custom field',
  'cf': 'custom field',

  'event action': 'event action',
  'event actions': 'event action',
  'custom event': 'event action',
  'ea': 'event action',

  'custom menu': 'custom menu',

  'quick report': 'quick report',
  'quick reports': 'quick report',
  'qr': 'quick report',

  'business reporter': 'business reporter',
  'br': 'business reporter',

  'lobby': 'lobby',

  // Security
  'single sign-on': 'single sign-on',
  'sso': 'single sign-on',
  'permission sets': 'permission sets',

  // Data & Migration
  'migration': 'data migration',
  'data migration': 'data migration',
  'data management': 'data management',

  // Support
  'crim': 'crim',
  'implementation': 'implementation',
  'upgrade': 'upgrade',
  'patching': 'patch management',
  'patch management': 'patch management',

  // Consulting
  'technical consultant': 'technical consulting',
  'technical consulting': 'technical consulting',

  'functional consultant': 'functional consulting',
  'functional consulting': 'functional consulting',

  'business analyst': 'business analysis',
  'biz analyst': 'business analysis',
  'ba': 'business analysis',
  'business analysis': 'business analysis'
};

function cleanText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9+#./-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeSkill(value: string): string {
  const cleaned = cleanText(value).replace(/[-_/]+/g, ' ').replace(/\s+/g, ' ').trim();
  return ALIASES[cleaned] ?? ALIASES[cleanText(value)] ?? cleaned;
}

function splitRequiredSkills(value: string): string[] {
  return value
    .split(/[,;|\n\r]+/)
    .map((term) => term.trim())
    .filter(Boolean)
    .slice(0, 75);
}

function descriptionKeywords(value: string): string[] {
  const cleaned = cleanText(value);
  const phrases = Object.keys(ALIASES).filter((alias) => alias.includes(' ') && cleaned.includes(alias));
  const words = cleaned
    .split(' ')
    .map((word) => word.replace(/^[./-]+|[./-]+$/g, ''))
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word) && !/^\d+$/.test(word));
  return [...phrases, ...words].slice(0, 150);
}

function buildTerms(requiredSkills: string, description: string): RequirementTerm[] {
  const terms = new Map<string, RequirementTerm>();
  for (const label of splitRequiredSkills(requiredSkills)) {
    const canonical = normalizeSkill(label);
    if (!canonical) continue;
    terms.set(canonical, { label, canonical, kind: 'required', weight: 3 });
  }
  for (const label of descriptionKeywords(description)) {
    const canonical = normalizeSkill(label);
    if (!canonical || STOP_WORDS.has(canonical)) continue;
    if (!terms.has(canonical)) terms.set(canonical, { label, canonical, kind: 'keyword', weight: 1 });
  }
  return [...terms.values()];
}

function containsTerm(text: string, term: string): boolean {
  const canonical = normalizeSkill(term);
  const normalizeForSearch = (value: string) => cleanText(value).replace(/[-_/\.]+/g, ' ').replace(/\s+/g, ' ').trim();
  const normalizedText = ` ${normalizeForSearch(text)} `;
  const forms = [canonical, ...Object.entries(ALIASES)
    .filter(([, value]) => value === canonical)
    .map(([alias]) => alias)];
  if (forms.some((form) => {
    const normalized = normalizeForSearch(form);
    return normalized && normalizedText.includes(` ${normalized} `);
  })) return true;

  // Conservative suffix folding helps prose keywords ("deploy"/"deployed") while exact alias
  // matching above remains the authority for short technology names such as C, R, or Go.
  const normalizedTerm = normalizeForSearch(canonical);
  if (!/^[a-z]{5,}$/.test(normalizedTerm)) return false;
  const stem = (word: string) => word
    .replace(/ies$/, 'y')
    .replace(/ing$/, '')
    .replace(/ed$/, '')
    .replace(/s$/, '');
  const target = stem(normalizedTerm);
  return normalizeForSearch(text).split(' ').some((word) => stem(word) === target);
}

function scoreFields(fields: Field[], terms: RequirementTerm[]): Evidence {
  if (terms.length === 0) {
    return { score: 0, matchedRequiredSkills: [], matchedKeywords: [], reason: 'No matching requirement terms were provided.' };
  }

  const required = new Set<string>();
  const keywords = new Set<string>();
  let matchedWeight = 0;
  const totalWeight = terms.reduce((sum, term) => sum + term.weight, 0);

  for (const term of terms) {
    const bestFieldWeight = fields.reduce(
      (best, field) => containsTerm(field.text, term.canonical) ? Math.max(best, field.weight) : best,
      0
    );
    if (bestFieldWeight === 0) continue;
    matchedWeight += term.weight * bestFieldWeight;
    (term.kind === 'required' ? required : keywords).add(term.label);
  }

  // Coverage is the main signal; a small exact-match boost prevents a single explicit technology
  // from disappearing when a long prose requirements description supplies many secondary words.
  const coverage = totalWeight === 0 ? 0 : matchedWeight / totalWeight;
  const explicitBoost = Math.min(0.45, required.size * 0.18);
  const keywordBoost = Math.min(0.15, keywords.size * 0.025);
  const score = Math.min(100, Math.round((coverage + explicitBoost + keywordBoost) * 100));
  const matchedRequiredSkills = [...required];
  const matchedKeywords = [...keywords].slice(0, 8);
  const parts: string[] = [];
  if (matchedRequiredSkills.length) parts.push(`Matches required skills: ${matchedRequiredSkills.join(', ')}`);
  if (matchedKeywords.length) parts.push(`Supporting requirement terms: ${matchedKeywords.join(', ')}`);

  return {
    score,
    matchedRequiredSkills,
    matchedKeywords,
    reason: parts.length ? `${parts.join('. ')}.` : 'No direct match was found in this profile entry.',
  };
}

function ranked<T extends { score?: number }>(items: T[]): Array<T & { rank: number }> {
  const order = [...items].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return order.map((item, index) => ({ ...item, rank: index + 1 }));
}

function relevant(evidence: Evidence): boolean {
  return evidence.matchedRequiredSkills.length > 0 || evidence.score >= 18;
}

/** Certifications are concise, so any direct requirement-term match is meaningful enough to
 * select by default even when a long requirements description makes its percentage score low. */
function certificationRelevant(evidence: Evidence): boolean {
  return evidence.matchedRequiredSkills.length > 0 || evidence.matchedKeywords.length > 0;
}

/** Pure, deterministic recommendation engine. It only copies text from the supplied profile. */
export function recommendCvContent(
  employee: Employee,
  requiredSkills: string,
  skillsDescription: string
): CvRecommendationResult {
  const terms = buildTerms(requiredSkills, skillsDescription);

  const experience = ranked((employee.cvExperience ?? []).map((entry, index) => {
    const taskScores = ranked(entry.tasks.map((text, taskIndex) => {
      const evidence = scoreFields([{ text, weight: 1 }], terms);
      return { index: taskIndex, text, relevant: relevant(evidence), ...evidence };
    }));
    const evidence = scoreFields([
      { text: entry.position, weight: 0.75 },
      { text: entry.company, weight: 0.35 },
      ...entry.tasks.map((text) => ({ text, weight: 1 })),
    ], terms);
    return { index, ...entry, relevant: relevant(evidence), tasks: taskScores, ...evidence };
  }));

  const projects = ranked((employee.specialProjects ?? []).map((project, index) => {
    const points = splitProjectDescription(project.brief);
    const descriptionPoints = ranked(points.map((text, pointIndex) => {
      const evidence = scoreFields([{ text, weight: 1 }], terms);
      return { index: pointIndex, text, relevant: relevant(evidence), ...evidence };
    }));
    const skills = ranked((project.skills ?? []).map((text, skillIndex) => {
      const evidence = scoreFields([{ text, weight: 1 }], terms);
      return { index: skillIndex, text, relevant: relevant(evidence), ...evidence };
    }));
    const evidence = scoreFields([
      { text: project.title, weight: 0.75 },
      { text: project.brief, weight: 1 },
      ...(project.skills ?? []).map((text) => ({ text, weight: 1 })),
    ], terms);
    return { index, ...project, relevant: relevant(evidence), skills, descriptionPoints, ...evidence };
  }));

  const certifications = ranked((employee.cvCertifications ?? []).map((certification, index) => {
    const evidence = scoreFields([
      { text: certification.name, weight: 1 },
      { text: certification.issuer, weight: 0.5 },
    ], terms);
    return { index, ...certification, relevant: certificationRelevant(evidence), ...evidence };
  }));

  return {
    originalObjective: employee.summary ?? '',
    // An AI-free selector cannot safely rewrite an objective. Preserve it byte-for-byte.
    objective: employee.summary ?? '',
    academic: employee.cvAcademic ?? [],
    normalizedRequirements: {
      requiredSkills: terms.filter((term) => term.kind === 'required').map((term) => term.canonical),
      keywords: terms.filter((term) => term.kind === 'keyword').map((term) => term.canonical),
    },
    experience,
    projects,
    certifications,
  };
}

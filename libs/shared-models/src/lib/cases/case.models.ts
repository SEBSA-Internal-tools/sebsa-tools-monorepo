export type CasePriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | null;
export type CaseSlaStatus = 'OK' | 'AT_RISK' | 'BREACHED' | null;

export interface CaseView {
  id: string;
  status: string;
  priority: CasePriority;
  assignedTo: string | null;
  assignedToName: string | null;
  customerId: string;
  customerName: string;
  createdAt: string;
  closedAt: string | null;
  slaStatus: CaseSlaStatus;
  resolvedWithinSla: boolean | null;
  csatScore: number | null;
}

export interface CsoKpiMetrics {
  totalCases: number;
  openCases: number;
  closedCases: number;
  newCasesLast7Days: number;
  criticalHighOpenCases: number;
  slaRiskCases: number;
  averageCaseAgeDays: number;
  customerSatisfactionScore: number;
  slaCompliancePct: number;
}

export interface CaseStatusRow {
  status: string;
  count: number;
  pct: number;
  delta?: number;
}

export interface CaseAgeBucketRow {
  label: string;
  minDays: number;
  maxDays: number | null;
  count: number;
  pct: number;
}

export interface PriorityTrendPoint {
  date: string;
  CRITICAL: number;
  HIGH: number;
  MEDIUM: number;
  LOW: number;
  [priority: string]: number | string;
}

export interface ResolutionTrendPoint {
  date: string;
  resolved: number;
}

export interface CustomerMonthRow {
  month: string;
  customerId: string;
  customerName: string;
  count: number;
  delta?: number;
}

export interface WorkloadSegment {
  memberId: string;
  memberName: string;
  openCaseCount: number;
  color: string;
  dasharray: string;
  dashoffset: number;
}

export interface MemberOpenCaseRow {
  memberId: string;
  memberName: string;
  totalOpen: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  slaRisk: number;
}

export interface MemberCompletionRow {
  memberId: string;
  memberName: string;
  casesCompleted: number;
  totalTimeHours: number;
  avgTimeHours: number;
  avgCsat: number | null;
  slaMetPct: number;
}

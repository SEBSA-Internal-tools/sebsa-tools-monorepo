import type { CaseType, CaseStatus, CaseSummary } from '@sebsa-pm-tool/shared-models';
import type { CaseView } from '../../../core/services/cases.service';

export type CalendarViewMode = 'month' | 'week' | 'agenda';
export type CalendarColorByMode = 'type' | 'priority' | 'project' | 'status';
export type CalendarDensity = 'compact' | 'comfortable';
export type QuickPresetFilter = 'all' | 'my-cases' | 'critical' | 'overdue' | 'blocked';

export interface CalendarItem {
  id: string;
  title: string;
  date: string; // ISO date string (YYYY-MM-DD)
  endDate?: string;
  type: CaseType;
  status: CaseStatus;
  priority: string;
  priorityColor?: string | null;
  projectId?: string;
  projectName?: string;
  assignee?: string;
  assigneeId?: string;
  description?: string;
  caseNumber?: string;
  storyPoints?: number | null;
  isOverdue?: boolean;
  isBlocked?: boolean;
  raw?: unknown;
}

export interface DayWorkloadPip {
  color: string;
  type: CaseType;
  count: number;
}

export interface CalendarDay {
  date: Date;
  dateString: string; // YYYY-MM-DD
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  isWeekend: boolean;
  items: CalendarItem[];
  workloadPips: DayWorkloadPip[];
  hasOverdue: boolean;
  hasBlocked: boolean;
}

export interface CalendarFilterState {
  searchQuery: string;
  status: CaseStatus | 'ALL';
  type: CaseType | 'ALL';
  priority: string | 'ALL';
  projectId?: string;
  quickPreset: QuickPresetFilter;
  colorBy: CalendarColorByMode;
  density: CalendarDensity;
}

export interface CalendarKPI {
  label: string;
  value: number | string;
  icon: string;
  trend?: string;
  colorVariant: 'primary' | 'success' | 'warning' | 'purple' | 'info' | 'error';
}

/**
 * Clean adapter function converting backend CaseSummary / CaseView to CalendarItem,
 * preserving all backend business models, IDs, and relations.
 */
export function caseToCalendarItem(c: CaseSummary | CaseView): CalendarItem {
  const isCaseView = 'projectName' in c && typeof c.projectName === 'string';
  const projectName = isCaseView ? c.projectName : (c as CaseSummary).project?.name;
  const projectId = isCaseView ? c.projectId : (c as CaseSummary).projectId;

  const priorityName = isCaseView
    ? c.priority
    : (c as CaseSummary).priority?.name ?? 'Medium';
  const priorityColor = isCaseView
    ? c.priorityColor
    : (c as CaseSummary).priority?.color ?? null;

  let assigneeName: string | undefined;
  let assigneeId: string | undefined;
  if (isCaseView) {
    assigneeName = c.assignee;
  } else {
    const assignees = (c as CaseSummary).assignees;
    if (assignees && assignees.length > 0) {
      assigneeName = assignees.map((a) => a.name).join(', ');
      assigneeId = assignees[0]?.id;
    }
  }

  const hasExplicitDueDate = !!c.dueDate;
  const rawDate =
    c.dueDate ||
    ('updatedAt' in c && c.updatedAt ? c.updatedAt : null) ||
    ('createdAt' in c && (c as { createdAt?: string }).createdAt ? (c as { createdAt?: string }).createdAt : null) ||
    new Date().toISOString();

  const dateStr = typeof rawDate === 'string' && rawDate.length >= 10
    ? rawDate.slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  const todayStr = new Date().toISOString().slice(0, 10);
  const isDone = c.status === 'DONE' || c.status === 'CANCELLED';
  const isOverdue = hasExplicitDueDate && !isDone && dateStr < todayStr;
  const isBlocked = c.status === 'BLOCKED';

  return {
    id: c.id,
    title: c.title,
    date: dateStr,
    type: c.type,
    status: c.status,
    priority: priorityName,
    priorityColor,
    projectId,
    projectName,
    assignee: assigneeName,
    assigneeId,
    description: c.description ?? '',
    caseNumber: c.id.length > 8 ? `CASE-${c.id.slice(0, 4).toUpperCase()}` : c.id,
    isOverdue,
    isBlocked,
    raw: c,
  };
}

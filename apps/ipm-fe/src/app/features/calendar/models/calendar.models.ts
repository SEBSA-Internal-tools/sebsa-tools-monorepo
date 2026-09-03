import type { CaseType, CaseStatus, CaseSummary } from '@sebsa-pm-tool/shared-models';
import type { CaseView } from '../../../core/services/cases.service';

export type CalendarViewMode = 'month' | 'week' | 'agenda';
export type CalendarColorByMode = 'type' | 'priority' | 'project' | 'status';
export type CalendarDensity = 'compact' | 'comfortable';
export type QuickPresetFilter = 'all' | 'my-cases' | 'overdue' | 'blocked';
export type CalendarDateMode = 'dueDate' | 'startDate' | 'createdAt';

export interface CalendarItem {
  id: string;
  title: string;
  date: string; // Default mapped ISO date string (YYYY-MM-DD)
  dueDate?: string;
  startDate?: string;
  createdAt?: string;
  endDate?: string;
  type: CaseType;
  status: CaseStatus;
  priority: string;
  priorityColor?: string | null;
  projectId?: string;
  projectName?: string;
  assignee?: string;
  assigneeId?: string;
  assigneeIds?: string[];
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
  monthName: string;
  isCurrentMonth: boolean;
  isNextMonth: boolean;
  isPrevMonth: boolean;
  isMonthStart: boolean;
  isMonthEnd: boolean;
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
  dateMode: CalendarDateMode;
}

export interface CalendarKPI {
  label: string;
  value: number | string;
  icon: string;
  trend?: string;
  colorVariant: 'primary' | 'success' | 'warning' | 'purple' | 'info' | 'error';
}

/**
 * Normalizes any date input (ISO string, Date object, YYYY-MM-DD) to a standard YYYY-MM-DD key in local time.
 */
export function normalizeDateToKey(dateInput?: string | Date | null): string | undefined {
  if (!dateInput) return undefined;
  if (typeof dateInput === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
      return dateInput;
    }
    const d = new Date(dateInput);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
    return dateInput.length >= 10 ? dateInput.slice(0, 10) : undefined;
  }
  if (dateInput instanceof Date && !isNaN(dateInput.getTime())) {
    const y = dateInput.getFullYear();
    const m = String(dateInput.getMonth() + 1).padStart(2, '0');
    const day = String(dateInput.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return undefined;
}

/**
 * Clean adapter function converting backend CaseSummary / CaseView to CalendarItem,
 * preserving all backend business models, IDs, dates, and relations.
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
  let assigneeIds: string[] = [];
  if (isCaseView) {
    assigneeName = c.assignee;
    assigneeIds = (c as CaseView).assigneeIds || [];
    assigneeId = assigneeIds[0];
  } else {
    const assignees = (c as CaseSummary).assignees;
    if (assignees && assignees.length > 0) {
      assigneeName = assignees.map((a) => a.name).join(', ');
      assigneeIds = assignees.map((a) => a.id);
      assigneeId = assignees[0]?.id;
    }
  }

  // Extract separate dates cleanly using normalizeDateToKey
  const dueDateStr = normalizeDateToKey(c.dueDate);
  const startDateStr = normalizeDateToKey(c.startDate);
  const createdAtStr = normalizeDateToKey(
    c.createdAt || ('updatedAt' in c && c.updatedAt ? c.updatedAt : undefined)
  );

  // Default primary date: accurately use existing case dates without dumping dateless cases onto today
  const defaultDate = dueDateStr || startDateStr || createdAtStr || '';

  const todayStr = normalizeDateToKey(new Date())!;
  const statusUpper = (c.status || '').toUpperCase();
  const isDone = statusUpper === 'DONE' || statusUpper === 'CANCELLED';
  const isOverdue = !!dueDateStr && !isDone && dueDateStr < todayStr;
  const isBlocked = statusUpper === 'BLOCKED';

  return {
    id: c.id,
    title: c.title,
    date: defaultDate,
    dueDate: dueDateStr,
    startDate: startDateStr,
    createdAt: createdAtStr,
    type: c.type,
    status: c.status,
    priority: priorityName,
    priorityColor,
    projectId,
    projectName,
    assignee: assigneeName,
    assigneeId,
    assigneeIds,
    description: c.description ?? '',
    caseNumber: c.id.length > 8 ? `CASE-${c.id.slice(0, 4).toUpperCase()}` : c.id,
    isOverdue,
    isBlocked,
    raw: c,
  };
}

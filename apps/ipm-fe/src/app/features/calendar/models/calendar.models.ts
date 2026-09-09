import type { TaskStatus, TaskSummary, TaskCategory, CaseType } from '@sebsa-pm-tool/shared-models';
import type { TaskView } from '../../../core/services/tasks.service';

export type CalendarViewMode = 'month' | 'week' | 'agenda';
export type CalendarColorByMode = 'type' | 'priority' | 'project' | 'status';
export type CalendarDensity = 'compact' | 'comfortable';
export type QuickPresetFilter = 'all' | 'my-tasks' | 'overdue' | 'blocked';
export type CalendarDateMode = 'dueDate' | 'startDate' | 'createdAt';

export interface CalendarItem {
  id: string;
  title: string;
  date: string; // Default mapped ISO date string (YYYY-MM-DD)
  dueDate?: string;
  startDate?: string;
  createdAt?: string;
  endDate?: string;
  type: CaseType | string;
  taskType?: string;
  category?: TaskCategory | null;
  status: TaskStatus;
  priority: string;
  priorityColor?: string | null;
  projectId?: string;
  projectName?: string;
  caseId?: string;
  caseTitle?: string;
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
  type: string;
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
  status: TaskStatus | 'ALL';
  type: string | 'ALL';
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
 * Clean adapter function converting backend TaskSummary / TaskView to CalendarItem,
 * preserving all backend business models, IDs, dates, and relations.
 */
export function taskToCalendarItem(t: TaskSummary | TaskView): CalendarItem {
  const isTaskView = 'caseTitle' in t;
  const projectName = isTaskView
    ? (t as TaskView).projectName
    : ('case' in t && t.case && 'project' in t.case && t.case.project ? t.case.project.name : undefined);
  const projectId = isTaskView ? (t as TaskView).projectId : (t as TaskSummary).case?.projectId;
  const caseId = isTaskView ? (t as TaskView).caseId : (t as TaskSummary).caseId;
  const caseTitle = isTaskView ? (t as TaskView).caseTitle : (t as TaskSummary).case?.title;
  const caseType = isTaskView ? (t as TaskView).caseType : (t as TaskSummary).case?.type;

  const priorityName = isTaskView
    ? (t as TaskView).priority
    : ((t as TaskSummary).priority?.name ?? 'Medium');
  const priorityColor = isTaskView
    ? (t as TaskView).priorityColor
    : ((t as TaskSummary).priority?.color ?? null);

  let assigneeName: string | undefined;
  let assigneeId: string | undefined;
  let assigneeIds: string[] = [];
  if (isTaskView) {
    assigneeName = (t as TaskView).assignee;
    assigneeIds = (t as TaskView).assigneeIds || [];
    assigneeId = assigneeIds[0];
  } else {
    const assignees = (t as TaskSummary).assignees;
    if (assignees && assignees.length > 0) {
      assigneeName = assignees.map((a) => a.name).join(', ');
      assigneeIds = assignees.map((a) => a.id);
      assigneeId = assignees[0]?.id;
    }
  }

  const dueDateStr = normalizeDateToKey(t.dueDate);
  const startDateStr = normalizeDateToKey(t.startDate);
  const createdAtStr = normalizeDateToKey(
    t.createdAt || ('updatedAt' in t && t.updatedAt ? t.updatedAt : undefined)
  );

  const defaultDate = dueDateStr || startDateStr || createdAtStr || '';

  const todayStr = normalizeDateToKey(new Date())!;
  const statusUpper = (t.status || '').toUpperCase();
  const isDone = statusUpper === 'DONE' || statusUpper === 'CANCELLED';
  const isOverdue = !!dueDateStr && !isDone && dueDateStr < todayStr;
  const isBlocked = statusUpper === 'BLOCKED';

  return {
    id: t.id,
    title: t.title,
    date: defaultDate,
    dueDate: dueDateStr,
    startDate: startDateStr,
    createdAt: createdAtStr,
    type: caseType || 'TASK',
    taskType: ('taskTypeName' in t ? (t as TaskView).taskTypeName : ('taskType' in t && (t as TaskSummary).taskType ? (t as TaskSummary).taskType!.name : undefined)) || 'TASK',
    category: t.category ?? null,
    status: t.status,
    priority: priorityName,
    priorityColor,
    projectId,
    projectName,
    caseId,
    caseTitle,
    assignee: assigneeName,
    assigneeId,
    assigneeIds,
    description: t.description ?? '',
    caseNumber: t.id.length > 8 ? `TASK-${t.id.slice(0, 4).toUpperCase()}` : t.id,
    isOverdue,
    isBlocked,
    raw: t,
  };
}

export interface WorkSnapshotItem {
  id: string; title: string; status: string;
  dueDate?: string | null; createdAt?: string | null; assigneeIds?: readonly string[];
}
export interface DashboardInsight {
  label: string; value: string | number; description: string;
  tone?: 'neutral' | 'warning' | 'danger'; link?: string[]; linkLabel?: string;
}
export function dateValue(value?: string | null): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}
export function summarizeWork(items: readonly WorkSnapshotItem[], now = Date.now()) {
  const open = items.filter(item => !['DONE', 'CANCELLED'].includes(item.status));
  const completed = items.filter(item => item.status === 'DONE').length;
  const cancelled = items.filter(item => item.status === 'CANCELLED').length;
  const dated = open.filter(item => dateValue(item.dueDate) !== null);
  const overdue = dated.filter(item => dateValue(item.dueDate)! < now).sort((a,b) => dateValue(a.dueDate)! - dateValue(b.dueDate)!);
  const dueSoon = dated.filter(item => dateValue(item.dueDate)! >= now && dateValue(item.dueDate)! <= now + 7 * 86400000).sort((a,b) => dateValue(a.dueDate)! - dateValue(b.dueDate)!);
  const unassigned = open.filter(item => !item.assigneeIds?.length);
  const knownAge = open.filter(item => dateValue(item.createdAt) !== null && dateValue(item.createdAt)! <= now);
  const ages = knownAge.map(item => Math.floor((now - dateValue(item.createdAt)!) / 86400000));
  const oldest = [...knownAge].sort((a,b) => dateValue(a.createdAt)! - dateValue(b.createdAt)!)[0];
  return { total: items.length, open, completed, cancelled, dated, overdue, dueSoon, unassigned, oldest,
    blocked: open.filter(item => item.status === 'BLOCKED'),
    ageCoverage: knownAge.length,
    averageAge: ages.length ? Math.round(ages.reduce((sum,age) => sum + age, 0) / ages.length) : null,
    oldestAge: ages.length ? Math.max(...ages) : null,
    dateCoverage: open.length ? Math.round(dated.length / open.length * 100) : null,
    overdueRate: dated.length ? Math.round(overdue.length / dated.length * 100) : null,
    completionRate: items.length ? Math.round(completed / items.length * 100) : null,
  };
}
export function workInsights(items: readonly WorkSnapshotItem[], now = Date.now()): DashboardInsight[] {
  const s = summarizeWork(items, now);
  return [
    { label: 'Open cases', value: s.open.length, description: s.completed + ' completed; ' + s.cancelled + ' cancelled' },
    { label: 'Past due', value: s.overdue.length, description: s.dated.length ? 'Of ' + s.dated.length + ' open cases with a valid due date' : 'No open cases have a valid due date', tone: s.overdue.length ? 'danger' : 'neutral', ...(s.overdue[0] ? {link: ['/cases', s.overdue[0].id], linkLabel: 'Review earliest overdue'} : {}) },
    { label: 'Unassigned', value: s.unassigned.length, description: 'Open cases without an assigned owner', tone: s.unassigned.length ? 'warning' : 'neutral', ...(s.unassigned[0] ? {link: ['/cases', s.unassigned[0].id], linkLabel: 'Assign ownership'} : {}) },
    { label: 'Due in 7 days', value: s.dueSoon.length, description: 'Open cases due between now and the next 7 days', ...(s.dueSoon[0] ? {link: ['/cases', s.dueSoon[0].id], linkLabel: 'Review upcoming work'} : {}) },
  ];
}

import { summarizeWork, workInsights, WorkSnapshotItem } from './work-insights';
const now = Date.parse('2026-10-15T06:00:00Z');
const item = (id: string, patch: Partial<WorkSnapshotItem> = {}): WorkSnapshotItem => ({ id, title: id, status: 'IN_PROGRESS', assigneeIds: ['owner'], ...patch });
describe('dashboard work insights', () => {
  it('separates completed and cancelled cases and never gives empty data a perfect rate', () => {
    expect(summarizeWork([], now).completionRate).toBeNull();
    expect(summarizeWork([], now).dateCoverage).toBeNull();
    const s = summarizeWork([item('done', {status: 'DONE'}), item('cancel', {status: 'CANCELLED'}), item('open')], now);
    expect(s.completed).toBe(1); expect(s.cancelled).toBe(1); expect(s.open).toHaveLength(1); expect(s.completionRate).toBe(33);
  });
  it('counts only dated open work as overdue and reports coverage', () => {
    const s = summarizeWork([item('late',{dueDate:'2026-10-01'}),item('undated'),item('invalid',{dueDate:'invalid'}),item('closed',{status:'DONE',dueDate:'2026-01-01'})],now);
    expect(s.overdue.map(x=>x.id)).toEqual(['late']); expect(s.dated).toHaveLength(1); expect(s.dateCoverage).toBe(33); expect(s.overdueRate).toBe(100);
  });
  it('does not invent age for invalid, missing or future creation dates', () => {
    const s = summarizeWork([item('known',{createdAt:'2026-10-01T06:00:00Z'}),item('missing'),item('bad',{createdAt:'bad'}),item('future',{createdAt:'2026-11-01'})],now);
    expect(s.ageCoverage).toBe(1); expect(s.averageAge).toBe(14); expect(s.oldestAge).toBe(14);
  });
  it('selects earliest dated work without mutating API order and keeps blocked separate', () => {
    const items = [item('later',{dueDate:'2026-10-20'}),item('soon',{dueDate:'2026-10-16',status:'BLOCKED'}),item('unassigned',{assigneeIds:[]})];
    const s = summarizeWork(items,now); expect(s.dueSoon.map(x=>x.id)).toEqual(['soon','later']); expect(s.blocked).toHaveLength(1); expect(s.unassigned.map(x=>x.id)).toEqual(['unassigned']); expect(items[0].id).toBe('later');
    expect(workInsights(items,now)[3].link).toEqual(['/cases','soon']);
  });
});

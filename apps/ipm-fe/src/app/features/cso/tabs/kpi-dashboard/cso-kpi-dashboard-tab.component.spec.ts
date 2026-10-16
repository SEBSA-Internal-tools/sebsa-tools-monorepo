import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { CsoKpiDashboardTabComponent } from './cso-kpi-dashboard-tab.component';
import { CsoOverviewService, CsoTaskView } from '../../../../core/services/cso-overview.service';
import { AuthService } from '../../../../core/services/auth.service';
const now = Date.parse('2026-10-15T06:00:00Z');
const item = (id: string, patch: Partial<CsoTaskView> = {}): CsoTaskView => ({ id, title:id, priority:'HIGH', priorityColor:null, statusLabel:'inprogress', rawStatus:'IN_PROGRESS', workflowStageName:'SUPPORT', dueDate:'', projectId:'p', projectName:'Project', assigneeIds:['u1'], ...patch });
describe('service dashboard scope and dates', () => {
  let component: CsoKpiDashboardTabComponent; const tasks=signal<CsoTaskView[]>([]);
  beforeEach(() => {
    jest.useFakeTimers(); jest.setSystemTime(now); tasks.set([]);
    TestBed.configureTestingModule({providers:[{provide:CsoOverviewService,useValue:{tasks,isLoading:signal(false),errorMessage:signal(''),loadedAt:signal(null),detailsWarning:signal('')}},{provide:AuthService,useValue:{currentUser:signal({id:'u1',name:'Shared name',systemRole:'ADMIN'})}}]});
    component=TestBed.runInInjectionContext(()=>new CsoKpiDashboardTabComponent());
  });
  afterEach(()=>jest.useRealTimers());
  it('matches personal work by identity including multiple assignees',()=>{
    tasks.set([item('mine',{assigneeIds:['u1','u2'],assignee:'Shared name, Other'}),item('other',{assigneeIds:['u2'],assignee:'Shared name'})]);
    expect(component.activeTasks().map(item=>item.id)).toEqual(['mine']);
  });
  it('clamps the 30 day cohort and counts creation dates rather than due dates',()=>{
    component.setActiveTab('management');
    tasks.set([item('old',{createdAt:new Date(now-31*86400000).toISOString(),dueDate:new Date(now).toISOString()}),item('inside',{createdAt:new Date(now-29*86400000).toISOString()})]);
    expect(component.priorityTrendLines().reduce((sum,line)=>sum+line.counts.reduce((a,b)=>a+b,0),0)).toBe(1);
  });
  it('excludes cancelled cases from completed work and uses creation month for customer cohorts',()=>{
    component.setActiveTab('management'); tasks.set([item('cancelled',{rawStatus:'CANCELLED',statusLabel:'done',assignee:'A'}),item('done',{rawStatus:'DONE',statusLabel:'done',assignee:'A',createdAt:'2026-09-01',dueDate:'2026-10-01',customerName:'Client'})]);
    expect(component.memberCompletionRows()[0].completed).toBe(1);
    expect(component.customerMonthlyData()[0].month).toBe('2026-09');
  });
});

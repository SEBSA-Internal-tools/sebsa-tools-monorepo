import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, of, throwError } from 'rxjs';
import type { Project } from '@sebsa-pm-tool/shared-models';
import { ProjectOverviewComponent } from './project-overview.component';
import { CasesService } from '../../../../../../core/services/cases.service';
import { ProjectsService } from '../../../../services/projects.service';
describe('project overview data loading',()=>{
  let component: ProjectOverviewComponent; let loadCases: jest.Mock; let getSprintsObservable: jest.Mock; let changes: BehaviorSubject<unknown[]>;
  beforeEach(()=>{
    changes=new BehaviorSubject<unknown[]>([]); loadCases=jest.fn(()=>of([])); getSprintsObservable=jest.fn(()=>of([{id:'s',status:'ACTIVE'}]));
    TestBed.configureTestingModule({providers:[{provide:CasesService,useValue:{cases$:changes,getCasesByProject:()=>[],loadCases}},{provide:ProjectsService,useValue:{getSprintsObservable}}]});
    component=TestBed.runInInjectionContext(()=>new ProjectOverviewComponent()); component.project={id:'p'} as Project;
  });
  it('loads sprint data once independently of case changes',()=>{
    component.ngOnInit(); changes.next([]);
    expect(getSprintsObservable).toHaveBeenCalledTimes(1); expect(component.sprintStats().active).toBe(1); expect(component.caseLoading()).toBe(false);
  });
  it('reports a failed case snapshot without marking it loaded',()=>{
    loadCases.mockReturnValue(throwError(()=>new Error('unavailable'))); component.ngOnInit();
    expect(component.caseLoading()).toBe(false); expect(component.caseError()).toContain('unavailable');
  });
});

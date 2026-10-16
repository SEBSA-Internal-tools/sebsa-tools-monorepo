import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { CsoOverviewService } from './cso-overview.service';
describe('CSO snapshot integrity', () => {
  let service: CsoOverviewService; let http: HttpTestingController;
  beforeEach(() => { TestBed.configureTestingModule({providers:[provideHttpClient(),provideHttpClientTesting()]}); service=TestBed.inject(CsoOverviewService); http=TestBed.inject(HttpTestingController); });
  afterEach(() => { http.verify(); jest.restoreAllMocks(); });
  it('preserves raw cancellation and multiple assignee identities', () => {
    service.load({}); http.expectOne(req=>req.url==='/api/cases').flush([{id:'case',title:'Case',status:'CANCELLED',assignees:[{id:'one',name:'Same'},{id:'two',name:'Other'}],projectId:'project',type:'SUPPORT'}]); http.expectOne('/api/projects').flush([]);
    expect(service.tasks()[0].rawStatus).toBe('CANCELLED'); expect(service.tasks()[0].assigneeIds).toEqual(['one','two']); expect(service.loadedAt()).not.toBeNull();
  });
  it('ignores older filtered responses after a newer dashboard request completes', () => {
    service.load({category:'FUNCTIONAL'}); service.load({});
    const requests=http.match(req=>req.url==='/api/cases');
    requests[1].flush([{id:'current',title:'All cases',status:'IN_PROGRESS',projectId:'p',type:'SUPPORT'}]); http.expectOne('/api/projects').flush([]);
    requests[0].flush([{id:'stale',title:'Old queue',status:'TO_DO',projectId:'p',type:'SUPPORT'}]); http.expectOne('/api/projects').flush([]);
    expect(service.tasks().map(x=>x.id)).toEqual(['current']); expect(service.isLoading()).toBe(false); expect(service.errorMessage()).toBe('');
  });
  it('reports unavailable data instead of presenting a failed load as an empty snapshot', () => {
    jest.spyOn(console,'error').mockImplementation(()=>{}); service.load({}); http.expectOne(req=>req.url==='/api/cases').flush({}, {status:500,statusText:'Unavailable'});
    expect(service.errorMessage()).toContain('unavailable'); expect(service.loadedAt()).toBeNull(); expect(service.isLoading()).toBe(false);
  });
});

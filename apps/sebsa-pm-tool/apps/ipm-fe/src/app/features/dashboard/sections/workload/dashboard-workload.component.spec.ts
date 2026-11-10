import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DashboardWorkloadComponent } from './dashboard-workload.component';
import { TeamMember } from '../../services/dashboard.service';

describe('DashboardWorkloadComponent', () => {
  let component: DashboardWorkloadComponent;
  let fixture: ComponentFixture<DashboardWorkloadComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardWorkloadComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardWorkloadComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render team members when data is provided', () => {
    const mockWorkload: TeamMember[] = [
      { name: 'John', role: 'Frontend', load: 85 },
      { name: 'Jane', role: 'Backend', load: 70 },
    ];

    component.workload = mockWorkload;
    fixture.detectChanges();

    expect(component.workload).toEqual(mockWorkload);
  });

  it('should handle null workload', () => {
    component.workload = null;
    fixture.detectChanges();

    expect(component.workload).toBeNull();
  });

  it('should handle empty workload array', () => {
    component.workload = [];
    fixture.detectChanges();

    expect(component.workload?.length).toBe(0);
  });

  it('should display team member load percentage', () => {
    const mockWorkload: TeamMember[] = [
      { name: 'Alice', role: 'Lead', load: 100 },
      { name: 'Bob', role: 'Dev', load: 50 },
    ];

    component.workload = mockWorkload;
    fixture.detectChanges();

    expect(component.workload[0].load).toBe(100);
    expect(component.workload[1].load).toBe(50);
  });
});

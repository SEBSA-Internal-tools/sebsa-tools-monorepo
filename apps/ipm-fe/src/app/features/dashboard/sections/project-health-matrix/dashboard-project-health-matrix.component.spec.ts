import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DashboardProjectHealthMatrixComponent } from './dashboard-project-health-matrix.component';
import { ProjectHealthMatrix } from '../../services/dashboard.service';

describe('DashboardProjectHealthMatrixComponent', () => {
  let component: DashboardProjectHealthMatrixComponent;
  let fixture: ComponentFixture<DashboardProjectHealthMatrixComponent>;

  const mockProjectHealthData: ProjectHealthMatrix[] = [
    {
      projectName: 'Website Revamp',
      health: 'On Track',
      healthStatus: 'success',
      budget: 85,
      timeline: 68,
      resources: 92,
      risks: 2,
      completionPercentage: 68,
      team: ['Alice Johnson', 'Bob Smith'],
    },
    {
      projectName: 'Mobile App Release',
      health: 'At Risk',
      healthStatus: 'warning',
      budget: 45,
      timeline: 42,
      resources: 58,
      risks: 5,
      completionPercentage: 42,
      team: ['Carol Davis', 'David Wilson'],
    },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardProjectHealthMatrixComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardProjectHealthMatrixComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render project health matrix when data is provided', () => {
    component.projectHealthMatrix = mockProjectHealthData;
    fixture.detectChanges();

    const table = fixture.nativeElement.querySelector('.health-matrix-table');
    expect(table).toBeTruthy();

    const rows = fixture.nativeElement.querySelectorAll('.health-row');
    expect(rows.length).toBe(2);
  });

  it('should display empty state when no data is provided', () => {
    component.projectHealthMatrix = null;
    fixture.detectChanges();

    const emptyState = fixture.nativeElement.querySelector('.empty-state');
    expect(emptyState).toBeTruthy();
    expect(emptyState.textContent).toContain('No projects found');
  });

  it('should display empty state when data array is empty', () => {
    component.projectHealthMatrix = [];
    fixture.detectChanges();

    const emptyState = fixture.nativeElement.querySelector('.empty-state');
    expect(emptyState).toBeTruthy();
  });

  it('should correctly determine health status color', () => {
    expect(component.getHealthColor('success')).toBe('#10b981');
    expect(component.getHealthColor('warning')).toBe('#f59e0b');
    expect(component.getHealthColor('danger')).toBe('#ef4444');
    expect(component.getHealthColor('unknown')).toBe('#6b7280');
  });

  it('should correctly map health status to label', () => {
    expect(component.getStatusLabel('success')).toBe('On Track');
    expect(component.getStatusLabel('warning')).toBe('At Risk');
    expect(component.getStatusLabel('danger')).toBe('Critical');
    expect(component.getStatusLabel('unknown')).toBe('Unknown');
  });

  it('should correctly classify metrics', () => {
    expect(component.getMetricClass(90)).toBe('metric-excellent');
    expect(component.getMetricClass(70)).toBe('metric-good');
    expect(component.getMetricClass(50)).toBe('metric-fair');
    expect(component.getMetricClass(30)).toBe('metric-poor');
  });

  it('should display project names correctly', () => {
    component.projectHealthMatrix = mockProjectHealthData;
    fixture.detectChanges();

    const projectNames = fixture.nativeElement.querySelectorAll('.project-name');
    expect(projectNames[0].textContent).toContain('Website Revamp');
    expect(projectNames[1].textContent).toContain('Mobile App Release');
  });

  it('should display health status badges', () => {
    component.projectHealthMatrix = mockProjectHealthData;
    fixture.detectChanges();

    const healthBadges = fixture.nativeElement.querySelectorAll('.health-badge');
    expect(healthBadges.length).toBe(2);
    expect(healthBadges[0].textContent).toContain('On Track');
    expect(healthBadges[1].textContent).toContain('At Risk');
  });

  it('should display team member avatars', () => {
    component.projectHealthMatrix = mockProjectHealthData;
    fixture.detectChanges();

    const memberAvatars = fixture.nativeElement.querySelectorAll('.member-avatar');
    expect(memberAvatars.length).toBeGreaterThan(0);
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DashboardTimelineComponent } from './dashboard-timeline.component';
import { Milestone } from '../../services/dashboard.service';

describe('DashboardTimelineComponent', () => {
  let component: DashboardTimelineComponent;
  let fixture: ComponentFixture<DashboardTimelineComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardTimelineComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardTimelineComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render milestones when data is provided', () => {
    const mockMilestones: Milestone[] = [
      { title: 'Phase 1', owner: 'John', date: '2026-07-15', complete: true },
      { title: 'Phase 2', owner: 'Jane', date: '2026-08-15', complete: false },
    ];

    component.milestones = mockMilestones;
    fixture.detectChanges();

    expect(component.milestones).toEqual(mockMilestones);
  });

  it('should handle null milestones', () => {
    component.milestones = null;
    fixture.detectChanges();

    expect(component.milestones).toBeNull();
  });

  it('should handle empty milestones array', () => {
    component.milestones = [];
    fixture.detectChanges();

    expect(component.milestones?.length).toBe(0);
  });

  it('should display completion status', () => {
    const mockMilestones: Milestone[] = [
      { title: 'Complete', owner: 'John', date: '2026-07-01', complete: true },
      { title: 'Pending', owner: 'Jane', date: '2026-08-01', complete: false },
    ];

    component.milestones = mockMilestones;
    fixture.detectChanges();

    expect(component.milestones[0].complete).toBe(true);
    expect(component.milestones[1].complete).toBe(false);
  });
});

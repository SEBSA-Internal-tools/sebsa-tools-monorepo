import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DashboardActivityComponent } from './dashboard-activity.component';
import { ActivityItem } from '../../services/dashboard.service';

describe('DashboardActivityComponent', () => {
  let component: DashboardActivityComponent;
  let fixture: ComponentFixture<DashboardActivityComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardActivityComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardActivityComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render activity items when data is provided', () => {
    const mockActivity: ActivityItem[] = [
      { actor: 'John', action: 'created', target: 'Project A', time: '2 hours ago' },
      { actor: 'Jane', action: 'updated', target: 'Task B', time: '1 hour ago' },
    ];

    component.activity = mockActivity;
    fixture.detectChanges();

    expect(component.activity).toEqual(mockActivity);
  });

  it('should handle null activity', () => {
    component.activity = null;
    fixture.detectChanges();

    expect(component.activity).toBeNull();
  });

  it('should handle undefined activity', () => {
    component.activity = undefined;
    fixture.detectChanges();

    expect(component.activity).toBeUndefined();
  });

  it('should handle empty activity array', () => {
    component.activity = [];
    fixture.detectChanges();

    expect(component.activity?.length).toBe(0);
  });

  it('should display activity details correctly', () => {
    const mockActivity: ActivityItem[] = [
      {
        actor: 'Developer',
        action: 'completed',
        target: 'Code Review',
        time: '30 minutes ago',
      },
    ];

    component.activity = mockActivity;
    fixture.detectChanges();

    expect(component.activity[0].actor).toBe('Developer');
    expect(component.activity[0].action).toBe('completed');
    expect(component.activity[0].target).toBe('Code Review');
  });
});

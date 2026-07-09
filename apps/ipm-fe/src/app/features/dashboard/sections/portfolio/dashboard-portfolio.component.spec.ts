import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DashboardPortfolioComponent } from './dashboard-portfolio.component';
import { Project } from '../../services/dashboard.service';

describe('DashboardPortfolioComponent', () => {
  let component: DashboardPortfolioComponent;
  let fixture: ComponentFixture<DashboardPortfolioComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardPortfolioComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardPortfolioComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display projects when provided', () => {
    const mockProjects: Project[] = [
      {
        name: 'Test Project',
        owner: 'Test Owner',
        status: 'In progress',
        statusTone: 'progress',
        progress: 50,
        due: '18 Jul',
      },
    ];

    component.projects = mockProjects;
    fixture.detectChanges();

    const compiled = fixture.nativeElement;
    expect(compiled.textContent).toContain('Test Project');
  });

  it('should handle null projects', () => {
    component.projects = null;
    fixture.detectChanges();

    expect(component).toBeTruthy();
  });

  it('should display progress percentage correctly', () => {
    const mockProjects: Project[] = [
      {
        name: 'Test',
        owner: 'Owner',
        status: 'In progress',
        statusTone: 'progress',
        progress: 75,
        due: '18 Jul',
      },
    ];

    component.projects = mockProjects;
    fixture.detectChanges();

    const compiled = fixture.nativeElement;
    expect(compiled.textContent).toContain('75% complete');
  });
});

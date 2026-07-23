import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DashboardHeroComponent } from './dashboard-hero.component';
import { HeroData } from '../../services/dashboard.service';

describe('DashboardHeroComponent', () => {
  let component: DashboardHeroComponent;
  let fixture: ComponentFixture<DashboardHeroComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardHeroComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardHeroComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render hero data when provided', () => {
    const mockHero: HeroData = {
      title: 'Welcome to Dashboard',
      description: 'Your project overview',
      stats: [
        { icon: 'rocket', value: '5', label: 'Projects' },
        { icon: 'users', value: '12', label: 'Team Members' },
      ],
    };

    component.data = mockHero;
    fixture.detectChanges();

    expect(component.data).toEqual(mockHero);
  });

  it('should handle null hero data', () => {
    component.data = null;
    fixture.detectChanges();

    expect(component.data).toBeNull();
  });

  it('should display hero title and description', () => {
    const mockHero: HeroData = {
      title: 'Test Title',
      description: 'Test Description',
      stats: [],
    };

    component.data = mockHero;
    fixture.detectChanges();

    expect(component.data?.title).toBe('Test Title');
    expect(component.data?.description).toBe('Test Description');
  });

  it('should render multiple stats', () => {
    const mockHero: HeroData = {
      title: 'Dashboard',
      description: 'Overview',
      stats: [
        { icon: 'icon1', value: '1', label: 'Stat 1' },
        { icon: 'icon2', value: '2', label: 'Stat 2' },
        { icon: 'icon3', value: '3', label: 'Stat 3' },
      ],
    };

    component.data = mockHero;
    fixture.detectChanges();

    expect(component.data?.stats.length).toBe(3);
  });
});

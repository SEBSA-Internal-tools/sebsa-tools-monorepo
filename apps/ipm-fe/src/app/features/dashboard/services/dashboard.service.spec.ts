import { TestBed } from '@angular/core/testing';
import { DashboardService } from './dashboard.service';
import { HeroService } from './hero.service';
import { SummaryCardsService } from './summary-cards.service';
import { PortfolioService } from './portfolio.service';
import { TimelineService } from './timeline.service';
import { WorkloadService } from './workload.service';
import { ActivityService } from './activity.service';
import { of, throwError } from 'rxjs';

describe('DashboardService', () => {
  let service: DashboardService;
  let heroService: jest.Mocked<HeroService>;
  let summaryService: jest.Mocked<SummaryCardsService>;
  let portfolioService: jest.Mocked<PortfolioService>;
  let timelineService: jest.Mocked<TimelineService>;
  let workloadService: jest.Mocked<WorkloadService>;
  let activityService: jest.Mocked<ActivityService>;

  beforeEach(() => {
    const heroMock = { getHeroData: jest.fn() };
    const summaryMock = { getSummaryCards: jest.fn() };
    const portfolioMock = { getProjects: jest.fn() };
    const timelineMock = { getMilestones: jest.fn() };
    const workloadMock = { getTeamWorkload: jest.fn() };
    const activityMock = { getRecentActivity: jest.fn() };

    TestBed.configureTestingModule({
      providers: [
        DashboardService,
        { provide: HeroService, useValue: heroMock },
        { provide: SummaryCardsService, useValue: summaryMock },
        { provide: PortfolioService, useValue: portfolioMock },
        { provide: TimelineService, useValue: timelineMock },
        { provide: WorkloadService, useValue: workloadMock },
        { provide: ActivityService, useValue: activityMock },
      ],
    });

    service = TestBed.inject(DashboardService);
    heroService = TestBed.inject(HeroService) as jest.Mocked<HeroService>;
    summaryService = TestBed.inject(SummaryCardsService) as jest.Mocked<SummaryCardsService>;
    portfolioService = TestBed.inject(PortfolioService) as jest.Mocked<PortfolioService>;
    timelineService = TestBed.inject(TimelineService) as jest.Mocked<TimelineService>;
    workloadService = TestBed.inject(WorkloadService) as jest.Mocked<WorkloadService>;
    activityService = TestBed.inject(ActivityService) as jest.Mocked<ActivityService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should get dashboard data from all services', (done) => {
    const mockHero = { title: 'Test', description: 'Test', stats: [] };
    const mockCards = [{ label: 'Test', value: '1', change: '+1', icon: 'test' }];

    heroService.getHeroData.mockReturnValue(of(mockHero));
    summaryService.getSummaryCards.mockReturnValue(of(mockCards));
    portfolioService.getProjects.mockReturnValue(of([]));
    timelineService.getMilestones.mockReturnValue(of([]));
    workloadService.getTeamWorkload.mockReturnValue(of([]));
    activityService.getRecentActivity.mockReturnValue(of([]));

    const data = service.getDashboardData();

    data.hero$.subscribe((hero) => {
      expect(hero).toEqual(mockHero);
      done();
    });
  });

  it('should handle hero data service error', (done) => {
    const error = new Error('Hero service error');

    heroService.getHeroData.mockReturnValue(throwError(() => error));
    summaryService.getSummaryCards.mockReturnValue(of([]));
    portfolioService.getProjects.mockReturnValue(of([]));
    timelineService.getMilestones.mockReturnValue(of([]));
    workloadService.getTeamWorkload.mockReturnValue(of([]));
    activityService.getRecentActivity.mockReturnValue(of([]));

    const data = service.getDashboardData();

    data.hero$.subscribe((hero) => {
      expect(hero).toBeNull();
      done();
    });
  });

  it('should handle portfolio service error', (done) => {
    const error = new Error('Portfolio service error');

    heroService.getHeroData.mockReturnValue(of({ title: 'Test', description: 'Test', stats: [] }));
    summaryService.getSummaryCards.mockReturnValue(of([]));
    portfolioService.getProjects.mockReturnValue(throwError(() => error));
    timelineService.getMilestones.mockReturnValue(of([]));
    workloadService.getTeamWorkload.mockReturnValue(of([]));
    activityService.getRecentActivity.mockReturnValue(of([]));

    const data = service.getDashboardData();

    data.portfolio$.subscribe((projects) => {
      expect(projects).toBeNull();
      done();
    });
  });

  it('should replay cached data on multiple subscriptions', (done) => {
    const mockHero = { title: 'Test', description: 'Test', stats: [] };

    heroService.getHeroData.mockReturnValue(of(mockHero));
    summaryService.getSummaryCards.mockReturnValue(of([]));
    portfolioService.getProjects.mockReturnValue(of([]));
    timelineService.getMilestones.mockReturnValue(of([]));
    workloadService.getTeamWorkload.mockReturnValue(of([]));
    activityService.getRecentActivity.mockReturnValue(of([]));

    const data = service.getDashboardData();
    let subscriptionCount = 0;

    data.hero$.subscribe(() => subscriptionCount++);
    data.hero$.subscribe(() => subscriptionCount++);

    setTimeout(() => {
      expect(subscriptionCount).toBe(2);
      expect(heroService.getHeroData).toHaveBeenCalledTimes(1);
      done();
    }, 100);
  });
});

import { TestBed } from '@angular/core/testing';
import { PortfolioService } from './portfolio.service';

describe('PortfolioService', () => {
  let service: PortfolioService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PortfolioService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should return projects', (done) => {
    service.getProjects().subscribe((projects) => {
      expect(projects).toBeTruthy();
      expect(projects.length).toBe(3);
      expect(projects[0].name).toBe('Website Revamp');
      done();
    });
  });

  it('should have valid project structure', (done) => {
    service.getProjects().subscribe((projects) => {
      projects.forEach((project) => {
        expect(project.name).toBeTruthy();
        expect(project.owner).toBeTruthy();
        expect(project.status).toBeTruthy();
        expect(project.progress).toBeGreaterThanOrEqual(0);
        expect(project.progress).toBeLessThanOrEqual(100);
      });
      done();
    });
  });
});

import { TestBed } from '@angular/core/testing';
import { ProjectHealthMatrixService } from './project-health-matrix.service';
import { ProjectHealthMatrix } from './dashboard.service';

describe('ProjectHealthMatrixService', () => {
  let service: ProjectHealthMatrixService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ProjectHealthMatrixService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should return project health matrix data', (done) => {
    service.getProjectHealthMatrix().subscribe((data: ProjectHealthMatrix[]) => {
      expect(data).toBeTruthy();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
      done();
    });
  });

  it('should return data with required properties', (done) => {
    service.getProjectHealthMatrix().subscribe((data: ProjectHealthMatrix[]) => {
      const project = data[0];
      expect(project.projectName).toBeDefined();
      expect(project.health).toBeDefined();
      expect(project.healthStatus).toBeDefined();
      expect(project.budget).toBeDefined();
      expect(project.timeline).toBeDefined();
      expect(project.resources).toBeDefined();
      expect(project.risks).toBeDefined();
      expect(project.completionPercentage).toBeDefined();
      expect(project.team).toBeDefined();
      done();
    });
  });

  it('should return projects with valid health status values', (done) => {
    service.getProjectHealthMatrix().subscribe((data: ProjectHealthMatrix[]) => {
      data.forEach((project) => {
        expect(['success', 'warning', 'danger']).toContain(project.healthStatus);
      });
      done();
    });
  });

  it('should return projects with numeric metrics between 0 and 100', (done) => {
    service.getProjectHealthMatrix().subscribe((data: ProjectHealthMatrix[]) => {
      data.forEach((project) => {
        expect(project.budget).toBeGreaterThanOrEqual(0);
        expect(project.budget).toBeLessThanOrEqual(100);
        expect(project.timeline).toBeGreaterThanOrEqual(0);
        expect(project.timeline).toBeLessThanOrEqual(100);
        expect(project.resources).toBeGreaterThanOrEqual(0);
        expect(project.resources).toBeLessThanOrEqual(100);
        expect(project.completionPercentage).toBeGreaterThanOrEqual(0);
        expect(project.completionPercentage).toBeLessThanOrEqual(100);
      });
      done();
    });
  });

  it('should return projects with team member arrays', (done) => {
    service.getProjectHealthMatrix().subscribe((data: ProjectHealthMatrix[]) => {
      data.forEach((project) => {
        expect(Array.isArray(project.team)).toBe(true);
        expect(project.team.length).toBeGreaterThan(0);
      });
      done();
    });
  });
});

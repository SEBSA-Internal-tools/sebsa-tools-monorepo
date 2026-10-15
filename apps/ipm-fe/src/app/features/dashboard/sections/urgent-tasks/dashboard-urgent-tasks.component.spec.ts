import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import type { DashboardUrgentTask } from '@sebsa-pm-tool/shared-models';
import { DashboardUrgentTasksComponent, TaskCompletionRequest } from './dashboard-urgent-tasks.component';

describe('priority task completion feedback', () => {
  let component: DashboardUrgentTasksComponent;
  const task = { id: 'task-1', title: 'Review delivery' } as DashboardUrgentTask;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [{ provide: Router, useValue: { navigate: jest.fn() } }] });
    component = TestBed.runInInjectionContext(() => new DashboardUrgentTasksComponent());
  });
  it('keeps work pending until the server confirms success', () => {
    let request!: TaskCompletionRequest;
    component.taskCompleted.subscribe(value => request = value);
    component.onCompleteClick(task, new Event('click'));
    expect(component.isTaskCompleting(task.id)).toBe(true);
    expect(component.isTaskDone(task.id)).toBe(false);
    request.succeed();
    expect(component.isTaskCompleting(task.id)).toBe(false);
    expect(component.isTaskDone(task.id)).toBe(true);
  });
  it('releases a failed request and lets the user retry', () => {
    let request!: TaskCompletionRequest;
    const emitted = jest.fn();
    component.taskCompleted.subscribe(value => { request = value; emitted(); });
    component.onCompleteClick(task, new Event('click'));
    component.onCompleteClick(task, new Event('click'));
    expect(emitted).toHaveBeenCalledTimes(1);
    request.fail();
    expect(component.isTaskDone(task.id)).toBe(false);
    expect(component.isTaskCompleting(task.id)).toBe(false);
    expect(component.completionError()).toContain(task.title);
    component.onCompleteClick(task, new Event('click'));
    expect(emitted).toHaveBeenCalledTimes(2);
    expect(component.completionError()).toBe('');
  });
});

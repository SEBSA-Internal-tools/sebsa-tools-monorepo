import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { catchError, map, Observable, of, switchMap } from 'rxjs';
import { CaseStatus, CaseSummary as BackendCaseSummary, ProjectSummary, TaskCategory } from '@sebsa-pm-tool/shared-models';

export interface CsoOverviewFilters {
  projectId?: string;
  customerId?: string;
  priority?: string;
  assigneeId?: string;
  /** Restricts to the Functional or Technical queue when set. */
  category?: TaskCategory;
}

export interface CsoTaskView {
  id: string;
  rawStatus?: CaseStatus;
  assigneeIds?: string[];
  title: string;
  priority: string;
  priorityColor: string | null;
  /** Bucketed from the fixed, global CaseStatus enum — no per-project
   *  workflow-stage lookup needed anymore. */
  statusLabel: 'new' | 'todo' | 'inprogress' | 'done';
  workflowStageName: string;
  assignee?: string;
  dueDate: string;
  createdAt?: string;
  updatedAt?: string;
  projectId: string;
  projectName: string;
  customerName?: string;
}

function bucketStatus(status: CaseStatus): CsoTaskView['statusLabel'] {
  switch (status) {
    case 'TO_DO':
      return 'new';
    case 'IN_PROGRESS':
    case 'IN_REVIEW':
    case 'BLOCKED':
      return 'inprogress';
    case 'DONE':
    case 'CANCELLED':
      return 'done';
    default:
      return 'todo';
  }
}

@Injectable({ providedIn: 'root' })
export class CsoOverviewService {
  private readonly http = inject(HttpClient);

  private readonly _tasks = signal<CsoTaskView[]>([]);
  readonly tasks = this._tasks.asReadonly();

  private readonly _isLoading = signal(false);
  readonly isLoading = this._isLoading.asReadonly();
  readonly errorMessage = signal('');
  readonly loadedAt = signal<Date | null>(null);

  private activeRequest = 0;
  readonly detailsWarning = signal('');

  load(filters: CsoOverviewFilters): void {
    const request = ++this.activeRequest;
    this.detailsWarning.set('');
    this._isLoading.set(true);
    this.errorMessage.set('');

    let params = new HttpParams().set('isCsoLabeled', 'true');
    if (filters.projectId) params = params.set('projectId', filters.projectId);
    if (filters.customerId) params = params.set('customerId', filters.customerId);
    if (filters.assigneeId) params = params.set('assigneeId', filters.assigneeId);
    if (filters.category) params = params.set('category', filters.category);

    this.http
      .get<BackendCaseSummary[]>('/api/cases', { params })
      .pipe(switchMap((cases) => this.resolveDetails(cases, request)))
      .subscribe({
        next: (views) => {
          if (request !== this.activeRequest) return;
          this._tasks.set(views);
          this.loadedAt.set(new Date());
          this._isLoading.set(false);
        },
        error: (err) => {
          if (request !== this.activeRequest) return;
          console.error('Failed to load CSO cases:', err);
          this.errorMessage.set('CSO case data is unavailable. Retry to load the latest snapshot.');
          this._isLoading.set(false);
        },
      });
  }

  /** customerName isn't present on the flat cases response (project only
   *  carries {id, name}), so resolve it via one /api/projects call. */
  private resolveDetails(cases: BackendCaseSummary[], request: number): Observable<CsoTaskView[]> {
    if (cases.length === 0) return of([]);

    return this.http.get<ProjectSummary[]>('/api/projects').pipe(
      catchError(() => {
        if (request === this.activeRequest) this.detailsWarning.set('Customer labels are unavailable. Case totals are still available.');
        return of([]);
      }),
      map((projects) => {
        const customerNameByProjectId = new Map(
          projects.map((project) => [project.id, project.customer?.name]),
        );
        return cases.map((kase) => this.toCsoTaskView(kase, customerNameByProjectId.get(kase.projectId)));
      }),
    );
  }

  private toCsoTaskView(kase: BackendCaseSummary, customerName: string | undefined): CsoTaskView {
    return {
      id: kase.id,
      rawStatus: kase.status,
      assigneeIds: kase.assignees?.map(assignee => assignee.id) ?? [],
      title: kase.title,
      priority: kase.priority?.name ?? '',
      priorityColor: kase.priority?.color ?? null,
      statusLabel: bucketStatus(kase.status),
      workflowStageName: kase.type,
      assignee: kase.assignees?.map((a) => a.name).join(', ') || undefined,
      dueDate: kase.dueDate ?? '',
      createdAt: kase.createdAt ?? undefined,
      updatedAt: kase.updatedAt ?? undefined,
      projectId: kase.projectId,
      projectName: kase.project?.name ?? '',
      customerName,
    };
  }
}

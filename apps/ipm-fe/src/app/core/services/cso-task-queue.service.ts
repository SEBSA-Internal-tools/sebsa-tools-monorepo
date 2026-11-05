import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { catchError, map, Observable, of, switchMap } from 'rxjs';
import { CaseStatus, CaseSummary, ProjectSummary, TaskCategory } from '@sebsa-pm-tool/shared-models';

export interface CsoTaskQueueFilters {
  projectId?: string;
  customerId?: string;
  priorityId?: string;
  /** Which queue — Functional or Technical. Required: this is what routes
   *  a task into a queue in the first place. */
  category: TaskCategory;
}

export interface CsoQueueCaseView {
  id: string;
  title: string;
  priority: string;
  priorityColor: string | null;
  /** Bucketed from the fixed, global TaskStatus enum. */
  statusLabel: 'new' | 'todo' | 'inprogress' | 'done';
  caseType: string;
  dueDate: string;
  caseId: string;
  caseTitle: string;
  projectId: string;
  projectName: string;
  customerName?: string;
  /** The user holds an active, non-read-only role here, so may claim the case. */
  canSelfAssign: boolean;
}

function bucketStatus(status: CaseStatus): CsoQueueCaseView['statusLabel'] {
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

/** Backs the CSO Functional/Technical Queue tabs — unlike CsoOverviewService
 *  (which stays Case-based, feeding Overview/Dashboard/KPI), this queries
 *  Tasks directly: a task's own `category` tag is what routes it into a
 *  queue, independent of its parent Case's category. A queue is unclaimed
 *  work only — `unassigned=true` is always sent, so a task drops out the
 *  moment someone is assigned to it (it then surfaces in their own
 *  Assigned Tasks list instead). */
@Injectable({ providedIn: 'root' })
export class CsoTaskQueueService {
  private readonly http = inject(HttpClient);

  private readonly _cases = signal<CsoQueueCaseView[]>([]);
  readonly cases = this._cases.asReadonly();

  private readonly _isLoading = signal(false);
  readonly isLoading = this._isLoading.asReadonly();

  load(filters: CsoTaskQueueFilters): void {
    this._isLoading.set(true);

    let params = new HttpParams()
      .set('isCsoLabeled', 'true')
      .set('unassigned', 'true')
      .set('category', filters.category);
    if (filters.projectId) params = params.set('projectId', filters.projectId);
    if (filters.customerId) params = params.set('customerId', filters.customerId);
    if (filters.priorityId) params = params.set('priorityId', filters.priorityId);

    this.http
      .get<CaseSummary[]>('/api/cases', { params })
      .pipe(switchMap((cases) => this.resolveDetails(cases)))
      .subscribe({
        next: (views) => {
          this._cases.set(views);
          this._isLoading.set(false);
        },
        error: (err) => {
          console.error('Failed to load CSO cases:', err);
          this._cases.set([]);
          this._isLoading.set(false);
        },
      });
  }

  /** customerName isn't present on the flat tasks response, so resolve it
   *  via one /api/projects call, same trick CsoOverviewService uses. */
  private resolveDetails(cases: CaseSummary[]): Observable<CsoQueueCaseView[]> {
    if (cases.length === 0) return of([]);

    return this.http.get<ProjectSummary[]>('/api/projects').pipe(
      catchError(() => of([])),
      map((projects) => {
        const projectById = new Map(projects.map((project) => [project.id, project]));
        return cases.map((kase) => this.toQueueCaseView(kase, projectById.get(kase.projectId)));
      }),
    );
  }

  private toQueueCaseView(kase: CaseSummary, project: ProjectSummary | undefined): CsoQueueCaseView {
    return {
      id: kase.id,
      title: kase.title,
      priority: kase.priority?.name ?? '',
      priorityColor: kase.priority?.color ?? null,
      statusLabel: bucketStatus(kase.status),
      caseType: kase.type,
      dueDate: kase.dueDate ?? '',
      caseId: kase.id,
      caseTitle: kase.title,
      projectId: kase.projectId,
      projectName: project?.name ?? '',
      customerName: project?.customer?.name,
      canSelfAssign: !!project && Object.values(project.permissions).some(Boolean),
    };
  }
}

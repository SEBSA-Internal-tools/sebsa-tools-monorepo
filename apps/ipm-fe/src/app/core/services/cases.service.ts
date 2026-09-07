import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { BehaviorSubject, Observable, tap, map, of, finalize, shareReplay } from 'rxjs';
import {
  CreateCaseRequest,
  Case as BackendCase,
  CaseCategoryAssignmentEntry,
  CaseStatus,
  CaseStatusHistoryEntry,
  CaseSummary as BackendCaseSummary,
  CaseType,
  TaskCategory,
  UpdateCaseRequest,
} from '@sebsa-pm-tool/shared-models';

/** Fixed, global lifecycle — not per-project configurable. Replaces the old
 * dynamic WorkflowStage list this board used to read from the backend. */
export const CASE_STATUSES: { id: CaseStatus; name: string }[] = [
  { id: 'TO_DO', name: 'To Do' },
  { id: 'IN_PROGRESS', name: 'In Progress' },
  { id: 'IN_REVIEW', name: 'In Review' },
  { id: 'BLOCKED', name: 'Blocked' },
  { id: 'DONE', name: 'Done' },
  { id: 'CANCELLED', name: 'Cancelled' },
];

export interface CaseView {
  id: string;
  title: string;
  description: string;
  type: CaseType;
  status: CaseStatus;
  priority: string;
  priorityColor: string | null;
  duration: string;
  assignee?: string;
  assigneeIds?: string[];
  dueDate: string;
  startDate?: string | null;
  createdAt?: string;
  projectId: string;
  projectName: string;
  sprintId?: string | null;
  milestoneId?: string | null;
  isCsoLabeled: boolean;
  tag: TaskCategory | null;
  taskCount?: number;
  updatedAt?: string;
}

@Injectable({ providedIn: 'root' })
export class CasesService {
  private readonly http = inject(HttpClient);

  private readonly _cases = signal<CaseView[]>([]);
  readonly cases = this._cases.asReadonly();

  readonly cases$: Observable<CaseView[]>;
  private readonly _casesSubject = new BehaviorSubject<CaseView[]>([]);

  private currentProjectId?: string;
  private readonly inFlightLoads = new Map<string, Observable<CaseView[]>>();

  constructor() {
    this.cases$ = this._casesSubject.asObservable();
  }

  private setState(cases: CaseView[]): void {
    this._cases.set(cases);
    this._casesSubject.next(cases);
  }

  get currentCases(): CaseView[] {
    return this._cases();
  }

  loadCases(projectId: string, force = false): Observable<CaseView[]> {
    if (!force && this.currentProjectId === projectId && this._cases().length > 0) {
      return of(this._cases());
    }

    const cacheKey = projectId;
    const existing$ = this.inFlightLoads.get(cacheKey);
    if (existing$) {
      return existing$;
    }

    this.currentProjectId = projectId;
    const params = new HttpParams().set('projectId', projectId);
    const req$ = this.http
      .get<BackendCaseSummary[]>('/api/cases', { params })
      .pipe(
        map((cases) => cases.map((c) => this.toCaseView(c))),
        tap((cases) => this.setState(cases)),
        finalize(() => this.inFlightLoads.delete(cacheKey)),
        shareReplay(1)
      );

    this.inFlightLoads.set(cacheKey, req$);
    req$.subscribe({ error: (err) => console.error('Failed to load cases:', err) });
    return req$;
  }

  loadAllCases(projectId?: string, force = false): Observable<CaseView[]> {
    const cacheKey = projectId ?? '__ALL__';
    if (!force && this.inFlightLoads.has(cacheKey)) {
      return this.inFlightLoads.get(cacheKey)!;
    }

    let params = new HttpParams();
    if (projectId) {
      this.currentProjectId = projectId;
      params = params.set('projectId', projectId);
    } else {
      this.currentProjectId = undefined;
    }

    const req$ = this.http
      .get<BackendCaseSummary[]>('/api/cases', { params })
      .pipe(
        map((cases) => cases.map((c) => this.toCaseView(c))),
        tap((cases) => this.setState(cases)),
        finalize(() => this.inFlightLoads.delete(cacheKey)),
        shareReplay(1)
      );

    this.inFlightLoads.set(cacheKey, req$);
    return req$;
  }

  createCase(dto: CreateCaseRequest): Observable<CaseView> {
    return this.http.post<BackendCase>('/api/cases', dto).pipe(
      map((c) => this.toCaseView(c)),
      tap((newCase) => {
        if (!this.currentProjectId || dto.projectId === this.currentProjectId) {
          this.setState([...this._cases(), newCase]);
        }
      }),
    );
  }

  updateCase(caseId: string, dto: UpdateCaseRequest): Observable<CaseView> {
    return this.http.patch<BackendCase>(`/api/cases/${caseId}`, dto).pipe(
      map((c) => this.toCaseView(c)),
      tap((updated) => {
        if (updated.projectId === this.currentProjectId) {
          this.setState(this._cases().map((c) => (c.id === updated.id ? updated : c)));
        }
      }),
    );
  }

  updateCaseStatus(caseId: string, status: CaseStatus): Observable<CaseView> {
    return this.updateCase(caseId, { status });
  }

  /** Local-only optimistic status move, mirroring TasksService's Kanban pattern. */
  patchCaseStatusLocally(caseId: string, status: CaseStatus): void {
    this.setState(this._cases().map((c) => (c.id === caseId ? { ...c, status } : c)));
  }

  getSprintCases(sprintId: string): CaseView[] {
    return this._cases().filter((c) => c.sprintId === sprintId);
  }

  getCasesByProject(projectId: string): CaseView[] {
    return this._cases().filter((c) => c.projectId === projectId);
  }

  getMyAssignedCases(): Observable<CaseView[]> {
    return this.http
      .get<BackendCaseSummary[]>('/api/cases/my-assigned')
      .pipe(map((cases) => cases.map((c) => this.toCaseView(c))));
  }

  getCaseById(caseId: string): Observable<BackendCase> {
    return this.http.get<BackendCase>(`/api/cases/${caseId}`);
  }

  searchCasesInProject(projectId: string, search?: string): Observable<BackendCaseSummary[]> {
    let params = new HttpParams().set('projectId', projectId);
    if (search) params = params.set('search', search);
    return this.http.get<BackendCaseSummary[]>('/api/cases', { params });
  }

  getStatusHistory(caseId: string): Observable<CaseStatusHistoryEntry[]> {
    return this.http.get<CaseStatusHistoryEntry[]>(`/api/cases/${caseId}/status-history`);
  }

  getCategoryHistory(caseId: string): Observable<CaseCategoryAssignmentEntry[]> {
    return this.http.get<CaseCategoryAssignmentEntry[]>(`/api/cases/${caseId}/category-history`);
  }

  deleteCase(caseId: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`/api/cases/${caseId}`).pipe(
      tap(() => this.setState(this._cases().filter((c) => c.id !== caseId))),
    );
  }

  private toCaseView(kase: BackendCase | BackendCaseSummary): CaseView {
    const assignee = kase.assignees?.map((a) => a.name).join(', ') || undefined;
    const assigneeIds = kase.assignees?.map((a) => a.id) || [];
    return {
      id: kase.id,
      title: kase.title,
      description: kase.description ?? '',
      type: kase.type,
      status: kase.status,
      priority: kase.priority?.name ?? 'Medium',
      priorityColor: kase.priority?.color ?? null,
      duration: kase.dueDate ? `${kase.dueDate.slice(0, 10)}` : 'No due date',
      assignee,
      assigneeIds,
      dueDate: kase.dueDate ?? '',
      startDate: kase.startDate ?? null,
      createdAt: kase.createdAt ?? undefined,
      projectId: kase.projectId,
      projectName: kase.project.name,
      sprintId: kase.sprintId,
      milestoneId: kase.milestoneId,
      isCsoLabeled: kase.isCsoLabeled,
      tag: kase.category,
      taskCount: 'taskCount' in kase ? kase.taskCount : undefined,
      updatedAt: 'updatedAt' in kase ? kase.updatedAt : undefined,
    };
  }
}

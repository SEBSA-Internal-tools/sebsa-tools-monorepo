import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import type { Observable } from 'rxjs';
import { FormsModule } from '@angular/forms';
import type { Case, CaseSummary, ProjectSummary, TaskCategory } from '@sebsa-pm-tool/shared-models';
import { ProjectsService } from '../../../features/projects/services/projects.service';
import { CasesService } from '../../services/cases.service';
import { TasksService } from '../../services/tasks.service';
import { CustomSelectComponent } from '../custom-select/custom-select.component';

export interface CopyRequest {
  title: string;
  /** Target project (always set). */
  projectId: string;
  /** Target case — tasks only. */
  caseId?: string;
  /** Cases only. */
  includeTasks?: boolean;
  /** Only set when the target is CSO and the original has no category. */
  category?: TaskCategory;
}

/**
 * Confirmation dialog shown before a case or task is copied: lets the user
 * check/rename the title, pick where the copy goes (same or another project /
 * case), warns about existing items with the same name, and shows a summary of
 * what will happen. The parent performs the actual request.
 */
@Component({
  standalone: true,
  selector: 'app-copy-dialog',
  imports: [CommonModule, FormsModule, CustomSelectComponent],
  templateUrl: './copy-dialog.component.html',
  styleUrl: './copy-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CopyDialogComponent implements OnChanges {
  @Input() isOpen = false;
  @Input() kind: 'case' | 'task' = 'case';
  @Input() sourceTitle = '';
  @Input() sourceProjectId = '';
  /** Task only: the case the original task belongs to. */
  @Input() sourceCaseId = '';
  /** The original's Functional/Technical tag, if any. */
  @Input() sourceCategory: TaskCategory | null = null;
  @Input() isBusy = false;
  @Input() errorMessage = '';
  /** Case only: number of tasks that "include tasks" would copy, if known. */
  @Input() taskCount: number | null = null;

  @Output() closed = new EventEmitter<void>();
  @Output() confirmed = new EventEmitter<CopyRequest>();

  private readonly projectsService = inject(ProjectsService);
  private readonly casesService = inject(CasesService);
  private readonly tasksService = inject(TasksService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly categoryOptions = [
    { value: 'FUNCTIONAL', label: 'Functional' },
    { value: 'TECHNICAL', label: 'Technical' },
  ];

  title = '';
  selectedProjectId = '';
  selectedCaseId = '';
  includeTasks = true;
  category: TaskCategory | '' = '';

  readonly projects = signal<ProjectSummary[]>([]);
  readonly cases = signal<CaseSummary[]>([]);
  readonly isLoadingTargets = signal(false);
  readonly loadError = signal('');
  /** Existing same-named items in the chosen target, for the warning. */
  readonly duplicateCount = signal(0);

  readonly projectOptions = computed(() =>
    this.projects().map((p) => ({ value: p.id, label: p.name })),
  );
  readonly caseOptions = computed(() =>
    this.cases().map((c) => ({ value: c.id, label: c.title })),
  );

  private duplicateRequest = 0;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen'] && this.isOpen) {
      this.title = this.sourceTitle;
      this.selectedProjectId = this.sourceProjectId;
      this.selectedCaseId = this.kind === 'task' ? this.sourceCaseId : '';
      this.includeTasks = true;
      this.category = '';
      this.duplicateCount.set(0);
      this.loadError.set('');
      this.loadProjects();
    }
  }

  get selectedProject(): ProjectSummary | undefined {
    return this.projects().find((p) => p.id === this.selectedProjectId);
  }

  get selectedCase(): CaseSummary | undefined {
    return this.cases().find((c) => c.id === this.selectedCaseId);
  }

  get isSameLocation(): boolean {
    return this.kind === 'case'
      ? this.selectedProjectId === this.sourceProjectId
      : this.selectedCaseId === this.sourceCaseId;
  }

  /** Target is CSO and the original carries no tag to inherit. */
  get needsCategory(): boolean {
    if (this.sourceCategory) return false;
    return this.kind === 'case'
      ? !!this.selectedProject?.isCsoProject
      : !!this.selectedCase?.isCsoLabeled;
  }

  get isValid(): boolean {
    if (this.title.trim().length < 3) return false;
    if (!this.selectedProjectId) return false;
    if (this.kind === 'task' && !this.selectedCaseId) return false;
    if (this.needsCategory && !this.category) return false;
    return !this.isLoadingTargets();
  }

  get kindLabel(): string {
    return this.kind === 'case' ? 'case' : 'task';
  }

  private loadProjects(): void {
    this.isLoadingTargets.set(true);
    this.projectsService.getProjects().subscribe({
      next: (projects) => {
        this.projects.set(projects);
        if (this.kind === 'task') {
          this.loadCases(this.selectedProjectId, this.sourceCaseId);
        } else {
          this.isLoadingTargets.set(false);
          this.checkDuplicates();
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.loadError.set('Could not load projects.');
        this.isLoadingTargets.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  private loadCases(projectId: string, preselectCaseId: string): void {
    this.isLoadingTargets.set(true);
    this.casesService.searchCasesInProject(projectId).subscribe({
      next: (cases) => {
        this.cases.set(cases);
        this.selectedCaseId = cases.some((c) => c.id === preselectCaseId) ? preselectCaseId : '';
        this.isLoadingTargets.set(false);
        this.checkDuplicates();
        this.cdr.markForCheck();
      },
      error: () => {
        this.cases.set([]);
        this.selectedCaseId = '';
        this.loadError.set('Could not load cases for that project.');
        this.isLoadingTargets.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  onProjectChange(projectId: string): void {
    this.selectedProjectId = projectId;
    this.category = '';
    this.loadError.set('');
    if (this.kind === 'task') {
      this.selectedCaseId = '';
      this.cases.set([]);
      this.duplicateCount.set(0);
      if (projectId) this.loadCases(projectId, '');
    } else {
      this.checkDuplicates();
    }
  }

  onCaseChange(caseId: string): void {
    this.selectedCaseId = caseId;
    this.category = '';
    this.checkDuplicates();
  }

  /** Looks for existing items in the target with the same name. Warn only. */
  checkDuplicates(): void {
    const name = this.title.trim();
    const request = ++this.duplicateRequest;
    const target = this.kind === 'case' ? this.selectedProjectId : this.selectedCaseId;
    if (!isOpenAndNamed(this.isOpen, name) || !target) {
      this.duplicateCount.set(0);
      return;
    }
    const lower = name.toLowerCase();
    const source$: Observable<Array<Pick<Case, 'title'>>> =
      this.kind === 'case'
        ? this.casesService.searchCasesInProject(target, name)
        : this.tasksService.searchTasksInCase(target, name);
    source$.subscribe({
      next: (items) => {
        if (request !== this.duplicateRequest) return;
        this.duplicateCount.set(items.filter((i) => i.title.trim().toLowerCase() === lower).length);
        this.cdr.markForCheck();
      },
      error: () => {
        if (request === this.duplicateRequest) this.duplicateCount.set(0);
      },
    });
  }

  onCancel(): void {
    if (this.isBusy) return;
    this.closed.emit();
  }

  onConfirm(): void {
    if (!this.isValid || this.isBusy) return;
    this.confirmed.emit({
      title: this.title.trim(),
      projectId: this.selectedProjectId,
      ...(this.kind === 'task' && { caseId: this.selectedCaseId }),
      ...(this.kind === 'case' && { includeTasks: this.includeTasks }),
      ...(this.needsCategory && this.category && { category: this.category }),
    });
  }
}

function isOpenAndNamed(isOpen: boolean, name: string): boolean {
  return isOpen && name.length >= 3;
}

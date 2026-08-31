import { Component, ChangeDetectionStrategy, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CasesService, CASE_STATUSES } from '../../../core/services/cases.service';
import { TasksService, TASK_STATUSES, type TaskView } from '../../../core/services/tasks.service';
import { ProjectsService } from '../../projects/services/projects.service';
import type {
  Case,
  CaseCategoryAssignmentEntry,
  CaseStatus,
  CreateTaskRequest,
  TaskCategory,
  UpdateCaseRequest,
} from '@sebsa-pm-tool/shared-models';
import {
  CreateTaskModalComponent,
  type TaskFormData,
} from '../../tasks/create-task/create-task-modal.component';

interface CaseEditDraft {
  title: string;
  description: string;
  priorityId: string;
  startDate: string;
  dueDate: string;
  storyPoints: number | null;
  isCsoLabeled: boolean;
  category: TaskCategory | '';
  assigneeId: string;
}

@Component({
  standalone: true,
  selector: 'app-case-detail-page',
  imports: [CommonModule, FormsModule, RouterLink, CreateTaskModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './case-detail.page.html',
  styleUrls: ['./case-detail.page.scss'],
})
export class CaseDetailPageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private location = inject(Location);
  private casesService = inject(CasesService);
  private tasksService = inject(TasksService);
  private projectsService = inject(ProjectsService);

  kase = signal<Case | null>(null);
  isLoading = signal(false);
  isSaving = signal(false);
  errorMessage = signal('');
  isAddTaskModalOpen = signal(false);

  isDirty = signal(false);
  draft: CaseEditDraft = {
    title: '',
    description: '',
    priorityId: '',
    startDate: '',
    dueDate: '',
    storyPoints: null,
    isCsoLabeled: false,
    category: '',
    assigneeId: '',
  };
  availablePriorities = signal<Array<{ id: string; name: string; color: string | null; order: number }>>([]);
  availableAssignees = signal<Array<{ id: string; name: string }>>([]);

  readonly statuses = CASE_STATUSES;
  readonly taskStatuses = TASK_STATUSES;
  categoryHistory = signal<CaseCategoryAssignmentEntry[]>([]);

  readonly tasks = computed<TaskView[]>(() => {
    const current = this.kase();
    if (!current) return [];
    return this.tasksService.tasks().filter((t) => t.caseId === current.id);
  });

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const caseId = params.get('id');
      if (!caseId) {
        this.router.navigate(['/projects']);
        return;
      }
      this.loadCase(caseId);
    });
  }

  private loadCase(caseId: string): void {
    this.isLoading.set(true);
    this.errorMessage.set('');
    this.categoryHistory.set([]);
    this.casesService.getCaseById(caseId).subscribe({
      next: (kase) => {
        this.kase.set(kase);
        this.populateDraft(kase);
        this.isLoading.set(false);
        this.tasksService.loadTasksByCase(caseId);
        this.loadCategoryHistory(caseId);
        this.loadPriorities(kase.projectId);
        this.loadAssignees(kase.projectId);
      },
      error: (err) => {
        console.error('Failed to load case:', err);
        this.errorMessage.set('Unable to load case details. The case may not exist or you may not have access.');
        this.isLoading.set(false);
      },
    });
  }

  private loadPriorities(projectId: string): void {
    this.projectsService.getProjectPriorities(projectId).subscribe({
      next: (priorities) => this.availablePriorities.set([...priorities].sort((a, b) => a.order - b.order)),
      error: () => this.availablePriorities.set([]),
    });
  }

  private loadAssignees(projectId: string): void {
    this.projectsService.getMembers(projectId).subscribe({
      next: (members) => this.availableAssignees.set(members.map((m) => m.user)),
      error: () => this.availableAssignees.set([]),
    });
  }

  private loadCategoryHistory(caseId: string): void {
    this.casesService.getCategoryHistory(caseId).subscribe({
      next: (history) => this.categoryHistory.set(history),
      error: () => this.categoryHistory.set([]),
    });
  }

  goBack(): void {
    this.location.back();
  }

  private populateDraft(kase: Case): void {
    this.draft = {
      title: kase.title,
      description: kase.description ?? '',
      priorityId: kase.priorityId,
      startDate: kase.startDate ? kase.startDate.split('T')[0] : '',
      dueDate: kase.dueDate ? kase.dueDate.split('T')[0] : '',
      storyPoints: kase.storyPoints,
      isCsoLabeled: kase.isCsoLabeled,
      category: kase.category ?? '',
      assigneeId: kase.assignees[0]?.id ?? '',
    };
    this.isDirty.set(false);
  }

  markDirty(): void {
    this.isDirty.set(true);
  }

  selectedPriorityColor(): string {
    const match = this.availablePriorities().find((p) => p.id === this.draft.priorityId);
    if (match) return match.color ?? '#64748b';
    const casePriority = this.kase()?.priority;
    if (casePriority?.id === this.draft.priorityId) return casePriority.color ?? '#64748b';
    return '#64748b';
  }

  fallbackPriorityOption(): { id: string; name: string } | null {
    const casePriority = this.kase()?.priority;
    if (!casePriority) return null;
    if (this.availablePriorities().some((p) => p.id === casePriority.id)) return null;
    return casePriority;
  }

  discardChanges(): void {
    const current = this.kase();
    if (!current) return;
    this.populateDraft(current);
    this.errorMessage.set('');
  }

  saveChanges(): void {
    const current = this.kase();
    if (!current || !this.isDirty()) return;

    if (!this.draft.title.trim()) {
      this.errorMessage.set('Case title cannot be empty.');
      return;
    }
    if (this.draft.isCsoLabeled && !this.draft.category) {
      this.errorMessage.set('Please tag this CSO case as Functional or Technical.');
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set('');

    const dto: UpdateCaseRequest = {
      title: this.draft.title,
      description: this.draft.description || undefined,
      priorityId: this.draft.priorityId || undefined,
      startDate: this.draft.startDate || undefined,
      dueDate: this.draft.dueDate || undefined,
      storyPoints: this.draft.storyPoints !== null ? this.draft.storyPoints : undefined,
      isCsoLabeled: this.draft.isCsoLabeled,
      assigneeIds: this.draft.assigneeId ? [this.draft.assigneeId] : [],
      category: this.draft.category || undefined,
    };

    this.casesService.updateCase(current.id, dto).subscribe({
      next: () => {
        this.casesService.getCaseById(current.id).subscribe((kase) => {
          this.kase.set(kase);
          this.populateDraft(kase);
          this.isSaving.set(false);
          this.loadCategoryHistory(current.id);
        });
      },
      error: (err) => {
        this.errorMessage.set(err?.error?.message || 'Failed to save changes. Please try again.');
        this.isSaving.set(false);
      },
    });
  }

  deleteCase(): void {
    const current = this.kase();
    if (!current) return;
    if (!confirm(`Delete "${current.title}"? This cannot be undone.`)) return;

    this.isLoading.set(true);
    this.errorMessage.set('');
    this.casesService.deleteCase(current.id).subscribe({
      next: () => this.router.navigate(['/projects', current.projectId]),
      error: (err) => {
        this.errorMessage.set(err?.error?.message || 'Failed to delete case.');
        this.isLoading.set(false);
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Status stepper
  // ---------------------------------------------------------------------------

  onStatusClick(status: CaseStatus): void {
    const current = this.kase();
    if (!current || status === current.status) return;

    this.isLoading.set(true);
    this.errorMessage.set('');
    this.casesService.updateCaseStatus(current.id, status).subscribe({
      next: () => {
        this.casesService.getCaseById(current.id).subscribe((kase) => {
          this.kase.set(kase);
          this.isLoading.set(false);
        });
      },
      error: () => {
        this.errorMessage.set('Failed to update case status.');
        this.isLoading.set(false);
      },
    });
  }

  isPastStatus(status: { id: CaseStatus }): boolean {
    const current = this.kase();
    if (!current) return false;
    const currentIndex = this.statuses.findIndex((s) => s.id === current.status);
    const statusIndex = this.statuses.findIndex((s) => s.id === status.id);
    return statusIndex < currentIndex;
  }

  // ---------------------------------------------------------------------------
  // Tasks
  // ---------------------------------------------------------------------------

  openAddTaskModal(): void {
    this.isAddTaskModalOpen.set(true);
  }

  closeAddTaskModal(): void {
    this.isAddTaskModalOpen.set(false);
  }

  onCreateTask(formData: TaskFormData): void {
    const current = this.kase();
    if (!current) return;

    const dto: CreateTaskRequest = {
      caseId: current.id,
      title: formData.title,
      description: formData.description || undefined,
      priorityId: formData.priorityId,
      dueDate: formData.dueDate || undefined,
      assigneeIds: formData.assigneeIds.length > 0 ? formData.assigneeIds : undefined,
    };

    this.isLoading.set(true);
    this.tasksService.createTask(dto).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.closeAddTaskModal();
      },
      error: () => {
        this.errorMessage.set('Failed to create task. Please try again.');
        this.isLoading.set(false);
      },
    });
  }

  navigateToTask(taskId: string): void {
    this.router.navigate(['/tasks', taskId]);
  }

  getTaskInitials(name: string): string {
    return name
      .split(' ')
      .map((word) => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  // ---------------------------------------------------------------------------
  // Formatting helpers
  // ---------------------------------------------------------------------------

  getTypeLabel(type: string): string {
    switch (type) {
      case 'EPIC':
        return 'Epic';
      case 'STORY':
        return 'Story';
      case 'BUG':
        return 'Bug';
      case 'IMPROVEMENT':
        return 'Improvement';
      case 'TEST':
        return 'Test';
      case 'GENERAL':
        return 'General';
      default:
        return type;
    }
  }

  getTypeIcon(type: string): string {
    switch (type) {
      case 'EPIC':
        return 'bolt';
      case 'STORY':
        return 'auto_stories';
      case 'BUG':
        return 'bug_report';
      case 'IMPROVEMENT':
        return 'trending_up';
      case 'TEST':
        return 'science';
      case 'GENERAL':
        return 'inventory_2';
      default:
        return 'task';
    }
  }

  getCategoryLabel(category: string): string {
    switch (category) {
      case 'FUNCTIONAL':
        return 'Functional';
      case 'TECHNICAL':
        return 'Technical';
      default:
        return category;
    }
  }

  formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }
}

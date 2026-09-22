import { Component, ChangeDetectionStrategy, OnInit, inject, signal, computed, ChangeDetectorRef } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CasesService, CASE_STATUSES } from '../../../core/services/cases.service';
import { TasksService, TASK_STATUSES, type TaskView } from '../../../core/services/tasks.service';
import { ProjectsService } from '../../projects/services/projects.service';
import type {
  Case,
  CaseStatus,
  CreateTaskRequest,
  TaskCategory,
  UpdateCaseRequest,
} from '@sebsa-pm-tool/shared-models';
import {
  CreateTaskModalComponent,
  type TaskFormData,
} from '../../tasks/create-task/create-task-modal.component';
import { ActivityFeedComponent } from '../../../core/components/activity-feed/activity-feed.component';
import { CommentSectionComponent } from '../../../core/components/comment-section/comment-section.component';
import { TaskAttachmentsComponent } from '../../../core/components/task-attachments/task-attachments.component';
import { CustomSelectComponent } from '../../../core/components/custom-select/custom-select.component';
import { CustomDatepickerComponent } from '../../../core/components/custom-datepicker/custom-datepicker.component';
import { ToastService } from '../../../core/services/toast.service';

interface CaseEditDraft {
  title: string;
  description: string;
  priorityId: string;
  startDate: string;
  dueDate: string;
  storyPoints: number | null;
  category: TaskCategory | '';
  assigneeId: string;
}

@Component({
  standalone: true,
  selector: 'app-case-detail-page',
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    CreateTaskModalComponent,
    ActivityFeedComponent,
    CommentSectionComponent,
    TaskAttachmentsComponent,
    CustomSelectComponent,
    CustomDatepickerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './case-detail.page.html',
  styleUrls: ['./case-detail.page.scss'],
})
export class CaseDetailPageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private location = inject(Location);
  private casesService = inject(CasesService);
  private toast = inject(ToastService);
  private tasksService = inject(TasksService);
  private projectsService = inject(ProjectsService);
  private cdr = inject(ChangeDetectorRef);

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
    category: '',
    assigneeId: '',
  };
  availablePriorities = signal<Array<{ id: string; name: string; color: string | null; order: number }>>([]);
  availableAssignees = signal<Array<{ id: string; name: string }>>([]);
  projectMembers = signal<Array<{ id: string; name: string }>>([]);

  readonly statuses = CASE_STATUSES;
  readonly taskStatuses = TASK_STATUSES;

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

  // ---------------------------------------------------------------------------
  // Jira link (one-way: Jira -> here)
  // ---------------------------------------------------------------------------

  readonly isEditingJiraLink = signal(false);
  readonly isSavingJiraLink = signal(false);
  jiraIssueKeyDraft = '';

  startJiraLinkEdit(): void {
    this.jiraIssueKeyDraft = this.kase()?.jiraIssueKey ?? '';
    this.isEditingJiraLink.set(true);
  }

  cancelJiraLinkEdit(): void {
    this.isEditingJiraLink.set(false);
    this.jiraIssueKeyDraft = '';
  }

  saveJiraLink(): void {
    const current = this.kase();
    const issueKey = this.jiraIssueKeyDraft.trim().toUpperCase();
    if (!current || !issueKey || this.isSavingJiraLink()) return;

    this.isSavingJiraLink.set(true);
    this.casesService.linkJiraIssue(current.id, issueKey).subscribe({
      next: () => {
        this.toast.success(`Linked to ${issueKey}.`);
        this.cancelJiraLinkEdit();
        this.isSavingJiraLink.set(false);
        this.refreshCase(current.id);
      },
      error: (err) => {
        this.toast.error(err?.error?.message ?? 'Could not link the Jira issue.');
        this.isSavingJiraLink.set(false);
      },
    });
  }

  unlinkJira(): void {
    const current = this.kase();
    if (!current || !window.confirm('Unlink this Jira issue? The synced status and description will be cleared.')) return;

    this.casesService.unlinkJiraIssue(current.id).subscribe({
      next: () => {
        this.toast.success('Unlinked from Jira.');
        this.refreshCase(current.id);
      },
      error: (err) => this.toast.error(err?.error?.message ?? 'Could not unlink.'),
    });
  }

  private refreshCase(caseId: string): void {
    this.casesService.getCaseById(caseId).subscribe((kase) => this.kase.set(kase));
  }

  formatSyncedAt(iso: string | null): string {
    return iso ? new Date(iso).toLocaleString() : '';
  }

  private loadCase(caseId: string): void {
    this.isLoading.set(true);
    this.errorMessage.set('');
    this.casesService.getCaseById(caseId).subscribe({
      next: (kase) => {
        this.kase.set(kase);
        this.populateDraft(kase);
        this.isLoading.set(false);
        this.tasksService.loadTasksByCase(caseId);
        this.loadPriorities(kase.projectId);
        this.loadAssignees(kase.projectId);
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Failed to load case:', err);
        this.errorMessage.set('Unable to load case details. The case may not exist or you may not have access.');
        this.isLoading.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  private loadPriorities(projectId: string): void {
    this.projectsService.getProjectPriorities(projectId).subscribe({
      next: (priorities) => {
        this.availablePriorities.set([...priorities].sort((a, b) => a.order - b.order));
        this.cdr.markForCheck();
      },
      error: () => {
        this.availablePriorities.set([]);
        this.cdr.markForCheck();
      },
    });
  }

  private loadAssignees(projectId: string): void {
    this.projectsService.getMembers(projectId).subscribe({
      next: (members) => {
        const userList: Array<{ id: string; name: string }> = members.map((m) => ({ id: m.user.id, name: m.user.name }));
        this.projectMembers.set([...userList]);
        const currentAssignees = this.kase()?.assignees ?? [];
        for (const a of currentAssignees) {
          if (!userList.some((u) => u.id === a.id)) {
            userList.push({ id: a.id, name: a.name });
          }
        }
        this.availableAssignees.set(userList);
        this.cdr.markForCheck();
      },
      error: () => {
        this.projectMembers.set([]);
        const currentAssignees = (this.kase()?.assignees ?? []).map((a) => ({ id: a.id, name: a.name }));
        this.availableAssignees.set(currentAssignees);
        this.cdr.markForCheck();
      },
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
      category: kase.category ?? '',
      assigneeId: kase.assignees[0]?.id ?? '',
    };
    if (kase.assignees && kase.assignees.length > 0) {
      const current = this.availableAssignees();
      const merged = [...current];
      for (const a of kase.assignees) {
        if (!merged.some((u) => u.id === a.id)) {
          merged.push({ id: a.id, name: a.name });
        }
      }
      this.availableAssignees.set(merged);
    }
    this.isDirty.set(false);
    this.cdr.markForCheck();
  }

  currentAssigneeName(): string {
    const assigneeId = this.draft.assigneeId;
    if (!assigneeId) return '';
    const match = this.availableAssignees().find((u) => u.id === assigneeId);
    if (match) return match.name;
    const currentAssignee = this.kase()?.assignees?.find((u) => u.id === assigneeId);
    if (currentAssignee) return currentAssignee.name;
    return '';
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
    if (current.project.isCsoProject && !this.draft.category) {
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
      assigneeIds: this.draft.assigneeId ? [this.draft.assigneeId] : [],
      category: this.draft.category || undefined,
    };

    this.casesService.updateCase(current.id, dto).subscribe({
      next: () => {
        this.casesService.getCaseById(current.id).subscribe((kase) => {
          this.kase.set(kase);
          this.populateDraft(kase);
          this.isSaving.set(false);
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
      category: formData.category,
      taskTypeId: formData.taskTypeId,
      complexityLevelId: formData.complexityLevelId,
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

  formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }
}

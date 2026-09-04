import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  OnChanges,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SprintService } from '../../projects/services/sprint.service';
import { ProjectsService } from '../../projects/services/projects.service';
import type { CaseType, SprintSummary, TaskCategory } from '@sebsa-pm-tool/shared-models';
import {
  PriorityModalComponent,
  PriorityFormData,
} from '../../projects/components/modals/priority-modal/priority-modal.component';

type AssigneeCandidate = { id: string; name: string; email: string };

export interface CaseFormData {
  title: string;
  projectId: string;
  assigneeIds: string[];
  priorityId?: string;
  type: CaseType;
  dueDate: string;
  description: string;
  sprintId?: string;
  /** Always derived from the target project's own CSO flag — a case can
   *  never be CSO-labeled independently of its project. */
  isCsoLabeled: boolean;
  category?: TaskCategory;
}

@Component({
  standalone: true,
  selector: 'app-create-case-modal',
  imports: [CommonModule, FormsModule, PriorityModalComponent],
  templateUrl: './create-case-modal.component.html',
  styleUrl: './create-case-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateCaseModalComponent implements OnChanges {
  @Input() isOpen = false;
  @Input() projectId = '';
  @Input() projectName = '';
  /** Whether the fixed `projectId` above is a CSO project — only meaningful
   *  when `projectId` is set. A case is CSO-labeled if and only if its
   *  project is, since all cases in a CSO project sync automatically. */
  @Input() isProjectCso = false;
  /** Restricts the project picker to CSO projects only and always treats the
   *  case as CSO-labeled, for entry points (CSO Queue/Overview) that only
   *  ever create CSO cases. */
  @Input() forceCsoLabeled = false;
  /** When set (the CSO Functional/Technical queue's "Create Case" entry
   *  point), the category picker is hidden and every case is created with
   *  this fixed tag instead of letting the user choose. */
  @Input() lockedCategory: TaskCategory | '' = '';
  @Input() initialDueDate = '';
  @Output() closed = new EventEmitter<void>();
  @Output() submitted = new EventEmitter<CaseFormData>();

  private readonly sprintService = inject(SprintService);
  private readonly projectsService = inject(ProjectsService);

  caseTitle = '';
  selectedAssigneeId = '';
  priorityId?: string;
  priority = '';
  readonly availablePriorities = signal<Array<{ id: string; name: string; color: string | null; order: number }>>([]);

  selectPriority(prio: { id: string; name: string }) {
    this.priorityId = prio.id;
    this.priority = prio.name;
  }

  selectedType: CaseType = 'STORY';
  dueDate = '';
  description = '';
  selectedSprintId = '';
  selectedProjectId = '';
  selectedProjectName = '';
  selectedCategory: TaskCategory | '' = '';

  readonly availableProjects = signal<Array<{ id: string; name: string; isCsoProject: boolean }>>([]);
  readonly availableSprints = signal<SprintSummary[]>([]);
  readonly availableAssignees = signal<AssigneeCandidate[]>([]);
  readonly isLoadingSprints = signal(false);
  readonly isLoadingUsers = signal(false);
  readonly sprintError = signal('');
  readonly userError = signal('');
  readonly isPriorityModalOpen = signal(false);

  ngOnChanges(): void {
    if (this.isOpen) {
      if (this.initialDueDate) {
        this.dueDate = this.initialDueDate;
      }
      if (this.projectId) {
        this.selectedProjectId = this.projectId;
        this.selectedProjectName = this.projectName;
        this.loadSprints(this.projectId);
        this.loadPriorities(this.projectId);
        this.loadAssignees(this.projectId);
      } else {
        this.loadAvailableProjects();
      }
    }
  }

  private loadAssignees(projectId: string): void {
    this.isLoadingUsers.set(true);
    this.userError.set('');
    this.selectedAssigneeId = '';
    this.projectsService.getMembers(projectId).subscribe({
      next: (members) => {
        this.availableAssignees.set(members.map((m) => m.user));
        this.isLoadingUsers.set(false);
      },
      error: () => {
        this.userError.set('Could not load project members.');
        this.availableAssignees.set([]);
        this.isLoadingUsers.set(false);
      },
    });
  }

  private loadSprints(projectId: string): void {
    this.isLoadingSprints.set(true);
    this.sprintError.set('');
    this.selectedSprintId = '';
    this.sprintService.getSprints(projectId).subscribe({
      next: (sprints) => {
        this.availableSprints.set(sprints);
        this.isLoadingSprints.set(false);
      },
      error: () => {
        this.sprintError.set('Could not load sprints.');
        this.availableSprints.set([]);
        this.isLoadingSprints.set(false);
      },
    });
  }

  private loadAvailableProjects(): void {
    this.projectsService.getProjects().subscribe({
      next: (projects) => {
        let mapped = projects.map((p) => ({ id: p.id, name: p.name, isCsoProject: p.isCsoProject }));
        // Forced-CSO entry points (CSO Queue/Overview "Create Case") may only
        // target CSO projects — otherwise the created case would be tagged
        // CSO while its project is not, which is the contradiction this
        // component must never allow.
        if (this.forceCsoLabeled) {
          mapped = mapped.filter((p) => p.isCsoProject);
        }
        this.availableProjects.set(mapped);
        if (mapped.length > 0 && !this.selectedProjectId) {
          this.onProjectSelect(mapped[0].id);
        }
      },
      error: () => this.availableProjects.set([]),
    });
  }

  onProjectSelect(projectId: string): void {
    this.selectedProjectId = projectId;
    const project = this.availableProjects().find((p) => p.id === projectId);
    if (project) {
      this.selectedProjectName = project.name;
      this.loadSprints(projectId);
      this.loadPriorities(projectId);
      this.loadAssignees(projectId);
    }
  }

  private loadPriorities(projectId: string): void {
    this.priorityId = undefined;
    this.priority = '';
    this.projectsService.getProjectPriorities(projectId).subscribe({
      next: (priorities) => {
        const sorted = [...priorities].sort((a, b) => a.order - b.order);
        this.availablePriorities.set(sorted);
        if (sorted.length > 0) this.selectPriority(sorted[0]);
      },
      error: () => this.availablePriorities.set([]),
    });
  }

  openAddPriorityModal(): void {
    const targetProjectId = this.projectId || this.selectedProjectId;
    if (!targetProjectId) {
      alert('Please select a project first');
      return;
    }
    this.isPriorityModalOpen.set(true);
  }

  closePriorityModal(): void {
    this.isPriorityModalOpen.set(false);
  }

  onPrioritySubmit(formData: PriorityFormData): void {
    const targetProjectId = this.projectId || this.selectedProjectId;
    if (!targetProjectId) return;

    this.projectsService
      .createProjectPriority(targetProjectId, { name: formData.name, color: formData.color ?? undefined, order: formData.order })
      .subscribe({
        next: (created) => {
          this.closePriorityModal();
          this.projectsService.getProjectPriorities(targetProjectId).subscribe({
            next: (priorities) => {
              const sorted = [...priorities].sort((a, b) => a.order - b.order);
              this.availablePriorities.set(sorted);
              const createdPrio = sorted.find((p) => p.id === created.id) || sorted[0];
              if (createdPrio) this.selectPriority(createdPrio);
            },
          });
        },
        error: (err) => {
          console.error('Failed to create priority:', err);
          alert(err.error?.message || 'Failed to create priority.');
        },
      });
  }

  isTargetProjectCso(): boolean {
    if (this.forceCsoLabeled) return true;
    if (this.projectId) return this.isProjectCso;
    const selected = this.availableProjects().find((p) => p.id === this.selectedProjectId);
    return selected?.isCsoProject ?? false;
  }

  getSprintLabel(sprint: SprintSummary): string {
    const statusLabel: Record<string, string> = { PLANNED: 'Planned', ACTIVE: 'Active', COMPLETED: 'Completed' };
    return `${sprint.name} (${statusLabel[sprint.status] ?? sprint.status})`;
  }

  onCancel(): void {
    this.resetForm();
    this.closed.emit();
  }

  onSubmit(): void {
    if (!this.caseTitle.trim()) {
      alert('Please enter a title');
      return;
    }

    const finalProjectId = this.projectId || this.selectedProjectId;
    if (!finalProjectId) {
      alert('Please select a project');
      return;
    }

    const finalIsCsoLabeled = this.isTargetProjectCso();
    if (finalIsCsoLabeled && !this.lockedCategory && !this.selectedCategory) {
      alert('Please tag this CSO case as Functional or Technical');
      return;
    }

    const formData: CaseFormData = {
      title: this.caseTitle,
      projectId: finalProjectId,
      assigneeIds: this.selectedAssigneeId ? [this.selectedAssigneeId] : [],
      priorityId: this.priorityId,
      type: this.selectedType,
      dueDate: this.dueDate,
      description: this.description,
      sprintId: this.selectedSprintId || undefined,
      isCsoLabeled: finalIsCsoLabeled,
      category: this.lockedCategory || this.selectedCategory || undefined,
    };

    this.submitted.emit(formData);
    this.resetForm();
    this.closed.emit();
  }

  private resetForm(): void {
    this.caseTitle = '';
    this.selectedAssigneeId = '';

    this.priorityId = undefined;
    this.selectedType = 'STORY';
    this.dueDate = '';
    this.description = '';
    this.selectedSprintId = '';
    this.selectedCategory = '';

    this.availableSprints.set([]);
    this.availableAssignees.set([]);
  }

  onBackdropClick(): void {
    this.onCancel();
  }
}

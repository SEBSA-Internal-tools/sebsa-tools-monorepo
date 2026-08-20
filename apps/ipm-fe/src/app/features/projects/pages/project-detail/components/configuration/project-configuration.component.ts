import {
  ChangeDetectionStrategy,
  Component,
  Input,
  inject,
  signal,
  OnChanges,
  SimpleChanges,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Project } from '@sebsa-pm-tool/shared-models';
import { ProjectsService } from '../../../../services/projects.service';
import { WorkflowModalComponent, WorkflowFormData } from '../../../../components/modals/workflow-modal/workflow-modal.component';
import { PriorityModalComponent, PriorityFormData } from '../../../../components/modals/priority-modal/priority-modal.component';

interface WorkflowStageView {
  id: string;
  name: string;
  order: number;
  isDefault: boolean;
  taskCount: number;
}

interface PriorityView {
  id: string;
  name: string;
  color: string | null;
  order: number;
  isDefault: boolean;
}

@Component({
  standalone: true,
  selector: 'project-configuration',
  imports: [CommonModule, WorkflowModalComponent, PriorityModalComponent],
  templateUrl: './project-configuration.component.html',
  styleUrl: './project-configuration.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectConfigurationComponent implements OnChanges {
  @Input({ required: true }) project!: Project;

  private readonly projectsService = inject(ProjectsService);
  private readonly cdr = inject(ChangeDetectorRef);

  workflowStages = signal<WorkflowStageView[]>([]);
  priorities = signal<PriorityView[]>([]);
  errorMessage = signal('');
  successMessage = signal('');

  // Workflow modal state
  isWorkflowModalOpen = false;
  editingWorkflowStage: WorkflowStageView | null = null;

  // Priority modal state
  isPriorityModalOpen = false;
  editingPriority: PriorityView | null = null;

  // Collapsible state — collapsed by default, expand on click.
  isWorkflowStagesCollapsed = true;
  isPrioritiesCollapsed = true;

  // ---- Drag-to-reorder state (Workflow Stages only) ----
  draggedStageId: string | null = null;

  /** Reordering is only safe while the pipeline is empty of in-flight work —
   *  once a non-Backlog stage holds a task, changing stage order could
   *  silently reshuffle what "further along" means for that task. Backlog
   *  is exempt since it's the untouched starting pool. */
  canReorderStages(): boolean {
    return this.workflowStages().every((s) => s.name === 'Backlog' || s.taskCount === 0);
  }

  toggleWorkflowStages(): void {
    this.isWorkflowStagesCollapsed = !this.isWorkflowStagesCollapsed;
  }

  togglePriorities(): void {
    this.isPrioritiesCollapsed = !this.isPrioritiesCollapsed;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['project'] && this.project?.id) {
      this.loadWorkflowStages();
      this.loadPriorities();
    }
  }

  // ---- Workflow Stage Methods ----

  loadWorkflowStages(): void {
    this.projectsService.getWorkflowStages(this.project.id).subscribe({
      next: (stages) => {
        this.workflowStages.set([...stages].sort((a, b) => a.order - b.order));
      },
      error: (err) => {
        console.error('Failed to load workflow stages:', err);
        this.showError('Failed to load workflow stages.');
      },
    });
  }

  openAddWorkflowModal(): void {
    this.editingWorkflowStage = null;
    this.isWorkflowModalOpen = true;
  }

  openEditWorkflowModal(stage: WorkflowStageView): void {
    this.editingWorkflowStage = stage;
    this.isWorkflowModalOpen = true;
  }

  closeWorkflowModal(): void {
    this.isWorkflowModalOpen = false;
    this.editingWorkflowStage = null;
  }

  onWorkflowSubmit(formData: WorkflowFormData): void {
    if (this.editingWorkflowStage) {
      // Update existing
      this.projectsService
        .updateWorkflowStage(this.project.id, this.editingWorkflowStage.id, formData.name, formData.order)
        .subscribe({
          next: () => {
            this.showSuccess('Workflow stage updated successfully.');
            this.loadWorkflowStages();
            this.closeWorkflowModal();
          },
          error: (err) => {
            console.error('Failed to update workflow stage:', err);
            this.showError(err.error?.message || 'Failed to update workflow stage.');
          },
        });
    } else {
      // Create new
      this.projectsService
        .createWorkflowStage(this.project.id, formData.name, formData.order)
        .subscribe({
          next: () => {
            this.showSuccess('Workflow stage added successfully.');
            this.loadWorkflowStages();
            this.closeWorkflowModal();
          },
          error: (err) => {
            console.error('Failed to create workflow stage:', err);
            this.showError(err.error?.message || 'Failed to create workflow stage.');
          },
        });
    }
  }

  deleteWorkflowStage(stage: WorkflowStageView): void {
    if (!confirm(`Are you sure you want to delete "${stage.name}"? This cannot be undone.`)) {
      return;
    }

    this.projectsService.deleteWorkflowStage(this.project.id, stage.id).subscribe({
      next: () => {
        this.showSuccess(`Workflow stage "${stage.name}" deleted.`);
        this.loadWorkflowStages();
      },
      error: (err) => {
        console.error('Failed to delete workflow stage:', err);
        this.showError(err.error?.message || 'Failed to delete workflow stage. It may have tasks assigned to it.');
      },
    });
  }

  // ---- Workflow Stage Reordering ----

  onStageDragStart(stageId: string): void {
    if (!this.canReorderStages()) return;
    this.draggedStageId = stageId;
  }

  onStageDragOver(event: DragEvent): void {
    if (!this.canReorderStages() || !this.draggedStageId) return;
    event.preventDefault();
  }

  onStageDrop(targetStageId: string): void {
    const draggedId = this.draggedStageId;
    this.draggedStageId = null;
    if (!this.canReorderStages() || !draggedId || draggedId === targetStageId) return;

    const current = this.workflowStages();
    const draggedIndex = current.findIndex((s) => s.id === draggedId);
    const targetIndex = current.findIndex((s) => s.id === targetStageId);
    if (draggedIndex === -1 || targetIndex === -1) return;

    const reordered = [...current];
    const [moved] = reordered.splice(draggedIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    // Optimistic update so the drag feels instant; reverts on failure below.
    this.workflowStages.set(reordered.map((s, i) => ({ ...s, order: i })));

    this.projectsService.reorderWorkflowStages(this.project.id, reordered.map((s) => s.id)).subscribe({
      next: () => this.loadWorkflowStages(),
      error: (err) => {
        console.error('Failed to reorder workflow stages:', err);
        this.showError(err.error?.message || 'Failed to reorder workflow stages.');
        this.loadWorkflowStages();
      },
    });
  }

  onStageDragEnd(): void {
    this.draggedStageId = null;
  }

  // ---- Priority Methods ----

  loadPriorities(): void {
    this.projectsService.getProjectPriorities(this.project.id).subscribe({
      next: (prios) => {
        this.priorities.set([...prios].sort((a, b) => a.order - b.order));
      },
      error: (err) => {
        console.error('Failed to load priorities:', err);
        this.showError('Failed to load priorities.');
      },
    });
  }

  openAddPriorityModal(): void {
    this.editingPriority = null;
    this.isPriorityModalOpen = true;
  }

  openEditPriorityModal(priority: PriorityView): void {
    this.editingPriority = priority;
    this.isPriorityModalOpen = true;
  }

  closePriorityModal(): void {
    this.isPriorityModalOpen = false;
    this.editingPriority = null;
  }

  onPrioritySubmit(formData: PriorityFormData): void {
    if (this.editingPriority) {
      // Update existing
      this.projectsService
        .updateProjectPriority(this.project.id, this.editingPriority.id, {
          name: formData.name,
          color: formData.color ?? undefined,
          order: formData.order,
        })
        .subscribe({
          next: () => {
            this.showSuccess('Priority updated successfully.');
            this.loadPriorities();
            this.closePriorityModal();
          },
          error: (err) => {
            console.error('Failed to update priority:', err);
            this.showError(err.error?.message || 'Failed to update priority.');
          },
        });
    } else {
      // Create new
      this.projectsService
        .createProjectPriority(this.project.id, {
          name: formData.name,
          color: formData.color ?? undefined,
          order: formData.order,
        })
        .subscribe({
          next: () => {
            this.showSuccess('Priority added successfully.');
            this.loadPriorities();
            this.closePriorityModal();
          },
          error: (err) => {
            console.error('Failed to create priority:', err);
            this.showError(err.error?.message || 'Failed to create priority.');
          },
        });
    }
  }

  deletePriority(priority: PriorityView): void {
    if (!confirm(`Are you sure you want to delete "${priority.name}"? This cannot be undone.`)) {
      return;
    }

    this.projectsService.deleteProjectPriority(this.project.id, priority.id).subscribe({
      next: () => {
        this.showSuccess(`Priority "${priority.name}" deleted.`);
        this.loadPriorities();
      },
      error: (err) => {
        console.error('Failed to delete priority:', err);
        this.showError(err.error?.message || 'Failed to delete priority. It may have tasks assigned to it.');
      },
    });
  }

  // ---- Helper Methods ----

  private showError(msg: string | string[]): void {
    const finalMsg = Array.isArray(msg) ? msg.join(', ') : msg;
    this.errorMessage.set(finalMsg);
    this.successMessage.set('');
    this.cdr.markForCheck();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    setTimeout(() => {
      this.errorMessage.set('');
      this.cdr.markForCheck();
    }, 5000);
  }

  private showSuccess(msg: string): void {
    this.successMessage.set(msg);
    this.errorMessage.set('');
    this.cdr.markForCheck();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    setTimeout(() => {
      this.successMessage.set('');
      this.cdr.markForCheck();
    }, 3000);
  }
}

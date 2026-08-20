import {
  ChangeDetectionStrategy,
  Component,
  Input,
  inject,
  signal,
  OnChanges,
  SimpleChanges,
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

  // Collapsible state
  isWorkflowStagesCollapsed = false;
  isPrioritiesCollapsed = false;

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

  private showError(msg: string): void {
    this.errorMessage.set(msg);
    this.successMessage.set('');
    setTimeout(() => this.errorMessage.set(''), 5000);
  }

  private showSuccess(msg: string): void {
    this.successMessage.set(msg);
    this.errorMessage.set('');
    setTimeout(() => this.successMessage.set(''), 3000);
  }
}

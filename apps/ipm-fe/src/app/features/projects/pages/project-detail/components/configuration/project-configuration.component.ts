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
import { PriorityModalComponent, PriorityFormData } from '../../../../components/modals/priority-modal/priority-modal.component';

interface PriorityView {
  id: string;
  name: string;
  color: string | null;
  order: number;
  isDefault: boolean;
}

/** Task/Case status is now a fixed, global lifecycle (see TaskStatus/
 * CaseStatus) rather than the old per-project customizable WorkflowStage
 * list, so this configuration page only manages Priorities now. */
@Component({
  standalone: true,
  selector: 'project-configuration',
  imports: [CommonModule, PriorityModalComponent],
  templateUrl: './project-configuration.component.html',
  styleUrl: './project-configuration.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectConfigurationComponent implements OnChanges {
  @Input({ required: true }) project!: Project;

  private readonly projectsService = inject(ProjectsService);
  private readonly cdr = inject(ChangeDetectorRef);

  priorities = signal<PriorityView[]>([]);
  errorMessage = signal('');
  successMessage = signal('');

  isPriorityModalOpen = false;
  editingPriority: PriorityView | null = null;

  isPrioritiesCollapsed = true;

  togglePriorities(): void {
    this.isPrioritiesCollapsed = !this.isPrioritiesCollapsed;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['project'] && this.project?.id) {
      this.loadPriorities();
    }
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
        this.showError(err.error?.message || 'Failed to delete priority. It may be in use by a case or task.');
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

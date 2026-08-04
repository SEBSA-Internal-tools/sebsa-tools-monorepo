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
import { ProjectsService, Sprint } from '../../../services/projects.service';

export interface TaskFormData {
  title: string;
  projectId: string;
  assignee: string;
  priority: 'High' | 'Medium' | 'Low';
  dueDate: string;
  description: string;
  sprintId?: string;
}

@Component({
  standalone: true,
  selector: 'create-task-modal',
  imports: [CommonModule, FormsModule],
  templateUrl: './create-task-modal.component.html',
  styleUrl: './create-task-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateTaskModalComponent implements OnChanges {
  @Input() isOpen = false;
  @Input() projectId = '';
  @Input() projectName = '';
  @Output() close = new EventEmitter<void>();
  @Output() submit = new EventEmitter<TaskFormData>();

  private projectsService = inject(ProjectsService);

  taskTitle = '';
  assignee = '';
  priority: 'High' | 'Medium' | 'Low' = 'High';
  dueDate = '';
  description = '';
  selectedSprintId = '';
  selectedProjectId = '';
  selectedProjectName = '';

  readonly availableProjects = signal<Array<{ id: string; name: string }>>([]);
  availableAssignees = [
    'Sarah Miller',
    'James Chen',
    'Emma Rodriguez',
    'David Kim',
    'Lisa Anderson',
    'Michael Brown',
  ];

  availableSprints: Sprint[] = [];

  ngOnChanges(): void {
    if (this.isOpen) {
      if (this.projectId) {
        this.selectedProjectId = this.projectId;
        this.selectedProjectName = this.projectName;
        this.availableSprints = this.projectsService.getSprints(this.projectId);
      } else {
        this.loadAvailableProjects();
      }
    }
  }

  private loadAvailableProjects(): void {
    this.projectsService.getProjects().subscribe({
      next: (projects) => {
        const mapped = projects.map((p) => ({ id: p.id, name: p.name }));
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
      this.availableSprints = this.projectsService.getSprints(projectId);
    }
  }

  onCancel(): void {
    this.resetForm();
    this.close.emit();
  }

  onSubmit(): void {
    if (!this.taskTitle.trim()) {
      alert('Please enter a task title');
      return;
    }

    const finalProjectId = this.projectId || this.selectedProjectId;
    if (!finalProjectId) {
      alert('Please select a project');
      return;
    }

    const formData: TaskFormData = {
      title: this.taskTitle,
      projectId: finalProjectId,
      assignee: this.assignee,
      priority: this.priority,
      dueDate: this.dueDate,
      description: this.description,
      sprintId: this.selectedSprintId || undefined,
    };

    this.submit.emit(formData);
    this.resetForm();
  }

  private resetForm(): void {
    this.taskTitle = '';
    this.assignee = '';
    this.priority = 'High';
    this.dueDate = '';
    this.description = '';
    this.selectedSprintId = '';
  }

  onBackdropClick(): void {
    this.onCancel();
  }
}

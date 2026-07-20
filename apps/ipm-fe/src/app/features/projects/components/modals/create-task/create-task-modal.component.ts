import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface TaskFormData {
  title: string;
  projectId: string;
  assignee: string;
  priority: 'High' | 'Medium' | 'Low';
  dueDate: string;
  description: string;
}

@Component({
  standalone: true,
  selector: 'create-task-modal',
  imports: [CommonModule, FormsModule],
  templateUrl: './create-task-modal.component.html',
  styleUrl: './create-task-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateTaskModalComponent {
  @Input() isOpen = false;
  @Input() projectId = '';
  @Input() projectName = '';
  @Output() close = new EventEmitter<void>();
  @Output() submit = new EventEmitter<TaskFormData>();

  taskTitle = '';
  assignee = '';
  priority: 'High' | 'Medium' | 'Low' = 'High';
  dueDate = '';
  description = '';

  availableAssignees = [
    'Sarah Miller',
    'James Chen',
    'Emma Rodriguez',
    'David Kim',
    'Lisa Anderson',
    'Michael Brown',
  ];

  onCancel(): void {
    this.resetForm();
    this.close.emit();
  }

  onSubmit(): void {
    if (!this.taskTitle.trim()) {
      alert('Please enter a task title');
      return;
    }

    const formData: TaskFormData = {
      title: this.taskTitle,
      projectId: this.projectId,
      assignee: this.assignee,
      priority: this.priority,
      dueDate: this.dueDate,
      description: this.description,
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
  }

  onBackdropClick(): void {
    this.onCancel();
  }
}

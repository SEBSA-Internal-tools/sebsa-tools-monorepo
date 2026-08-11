import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  OnChanges
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { Task, UpdateTaskRequest } from '@sebsa-pm-tool/shared-models';

@Component({
  standalone: true,
  selector: 'app-edit-task-modal',
  imports: [CommonModule, FormsModule],
  templateUrl: './edit-task-modal.component.html',
  styleUrl: './edit-task-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditTaskModalComponent implements OnChanges {
  @Input() isOpen = false;
  @Input() task: Task | null = null;
  @Output() closed = new EventEmitter<void>();
  @Output() submitted = new EventEmitter<UpdateTaskRequest>();

  taskTitle = '';
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM';
  dueDate = '';
  description = '';

  ngOnChanges(): void {
    if (this.isOpen && this.task) {
      this.taskTitle = this.task.title || '';
      this.priority = this.task.priority || 'MEDIUM';
      this.dueDate = this.task.dueDate ? this.task.dueDate.split('T')[0] : '';
      this.description = this.task.description || '';
    }
  }

  onCancel(): void {
    this.closed.emit();
  }

  onSubmit(): void {
    if (!this.taskTitle.trim()) {
      alert('Please enter a task title');
      return;
    }

    const formData: UpdateTaskRequest = {
      title: this.taskTitle,
      priority: this.priority,
      dueDate: this.dueDate || undefined,
      description: this.description || undefined,
    };

    this.submitted.emit(formData);
  }

  onBackdropClick(): void {
    this.onCancel();
  }
}

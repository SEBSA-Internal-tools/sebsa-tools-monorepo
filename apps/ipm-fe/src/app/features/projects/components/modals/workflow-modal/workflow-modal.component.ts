import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  signal,
  OnChanges,
  SimpleChanges
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface WorkflowFormData {
  name: string;
  order: number;
}

@Component({
  standalone: true,
  selector: 'workflow-modal',
  imports: [CommonModule, FormsModule],
  templateUrl: './workflow-modal.component.html',
  styleUrl: './workflow-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkflowModalComponent implements OnChanges {
  @Input() isOpen = false;
  @Input() editData: { name: string; order: number } | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() submit = new EventEmitter<WorkflowFormData>();

  name = '';
  order = 1;
  errorMessage = signal('');

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen'] && changes['isOpen'].currentValue) {
      if (this.editData) {
        this.name = this.editData.name;
        this.order = this.editData.order;
      } else {
        this.resetForm();
      }
    }
  }

  onCancel(): void {
    this.resetForm();
    this.close.emit();
  }

  onSubmit(): void {
    this.errorMessage.set('');

    if (!this.name.trim()) {
      this.errorMessage.set('Stage name is required');
      return;
    }

    if (this.order < 0) {
      this.errorMessage.set('Order must be 0 or greater');
      return;
    }

    const formData: WorkflowFormData = {
      name: this.name.trim(),
      order: this.order,
    };

    this.submit.emit(formData);
    this.resetForm();
  }

  onBackdropClick(): void {
    this.onCancel();
  }

  private resetForm(): void {
    this.name = '';
    this.order = 1;
    this.errorMessage.set('');
  }
}

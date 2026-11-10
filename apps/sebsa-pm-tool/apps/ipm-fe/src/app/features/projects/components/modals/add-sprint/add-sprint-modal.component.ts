import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { CustomDatepickerComponent } from '../../../../../core/components/custom-datepicker/custom-datepicker.component';

export interface AddSprintFormData {
  name: string;
  startDate: string;
  endDate: string;
  description?: string;
}

@Component({
  standalone: true,
  selector: 'add-sprint-modal',
  imports: [CommonModule, FormsModule, CustomDatepickerComponent],
  templateUrl: './add-sprint-modal.component.html',
  styleUrl: './add-sprint-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddSprintModalComponent {
  @Input() isOpen = false;
  @Input() projectId = '';
  @Output() close = new EventEmitter<void>();
  @Output() submit = new EventEmitter<AddSprintFormData>();

  sprintName = '';
  startDate = '';
  endDate = '';
  description = '';
  errorMessage = signal('');

  onCancel(): void {
    this.resetForm();
    this.close.emit();
  }

  onSubmit(): void {
    this.errorMessage.set('');

    if (!this.sprintName.trim()) {
      this.errorMessage.set('Sprint name is required');
      return;
    }

    if (!this.startDate) {
      this.errorMessage.set('Start date is required');
      return;
    }

    if (!this.endDate) {
      this.errorMessage.set('End date is required');
      return;
    }

    if (new Date(this.startDate) >= new Date(this.endDate)) {
      this.errorMessage.set('End date must be after start date');
      return;
    }

    const formData: AddSprintFormData = {
      name: this.sprintName,
      startDate: this.startDate,
      endDate: this.endDate,
      description: this.description || undefined,
    };

    this.submit.emit(formData);
    this.resetForm();
  }

  onBackdropClick(): void {
    this.onCancel();
  }

  private resetForm(): void {
    this.sprintName = '';
    this.startDate = '';
    this.endDate = '';
    this.description = '';
    this.errorMessage.set('');
  }
}

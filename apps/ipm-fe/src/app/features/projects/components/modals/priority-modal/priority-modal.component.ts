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

export interface PriorityFormData {
  name: string;
  color: string | null;
  order?: number;
}

@Component({
  standalone: true,
  selector: 'priority-modal',
  imports: [CommonModule, FormsModule],
  templateUrl: './priority-modal.component.html',
  styleUrl: './priority-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PriorityModalComponent implements OnChanges {
  @Input() isOpen = false;
  @Input() editData: { name: string; color: string | null; order: number } | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() submit = new EventEmitter<PriorityFormData>();

  name = '';
  color = '#000000';
  order = 1;
  errorMessage = signal('');

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen'] && changes['isOpen'].currentValue) {
      if (this.editData) {
        this.name = this.editData.name;
        this.color = this.editData.color || '#000000';
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
      this.errorMessage.set('Priority name is required');
      return;
    }

    const formData: PriorityFormData = {
      name: this.name.trim(),
      color: this.color,
    };

    if (this.editData) {
      if (this.order < 1) {
        this.errorMessage.set('Order must be 1 or greater');
        return;
      }
      formData.order = this.order;
    }

    this.submit.emit(formData);
    this.resetForm();
  }

  onBackdropClick(): void {
    this.onCancel();
  }

  private resetForm(): void {
    this.name = '';
    this.color = '#000000';
    this.order = 1;
    this.errorMessage.set('');
  }
}

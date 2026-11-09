import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  SimpleChanges,
  ChangeDetectionStrategy,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { Customer } from '@sebsa-pm-tool/shared-models';

export interface CustomerFormData {
  name: string;
  contactEmail?: string;
  contactPhone?: string;
  notes?: string;
}

@Component({
  standalone: true,
  selector: 'create-customer-modal',
  imports: [CommonModule, FormsModule],
  templateUrl: './create-customer-modal.component.html',
  styleUrl: './create-customer-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateCustomerModalComponent implements OnChanges {
  @Input() isOpen = false;
  @Input() editingCustomer: Customer | null = null;
  @Output() closed = new EventEmitter<void>();
  @Output() submitted = new EventEmitter<CustomerFormData>();

  protected readonly isEditMode = signal(false);

  name = '';
  contactEmail = '';
  contactPhone = '';
  notes = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen'] && this.isOpen) {
      this.isEditMode.set(!!this.editingCustomer);
      this.prefillForm();
    }
  }

  private prefillForm(): void {
    if (this.editingCustomer) {
      this.name = this.editingCustomer.name;
      this.contactEmail = this.editingCustomer.contactEmail ?? '';
      this.contactPhone = this.editingCustomer.contactPhone ?? '';
      this.notes = this.editingCustomer.notes ?? '';
    } else {
      this.resetForm();
    }
  }

  onCancel(): void {
    this.resetForm();
    this.closed.emit();
  }

  onSubmit(): void {
    if (!this.name.trim()) {
      alert('Please enter a customer name');
      return;
    }

    const formData: CustomerFormData = {
      name: this.name.trim(),
      contactEmail: this.contactEmail.trim() || undefined,
      contactPhone: this.contactPhone.trim() || undefined,
      notes: this.notes.trim() || undefined,
    };

    this.submitted.emit(formData);
    this.resetForm();
    this.closed.emit();
  }

  private resetForm(): void {
    this.name = '';
    this.contactEmail = '';
    this.contactPhone = '';
    this.notes = '';
  }

  onBackdropClick(): void {
    this.onCancel();
  }
}

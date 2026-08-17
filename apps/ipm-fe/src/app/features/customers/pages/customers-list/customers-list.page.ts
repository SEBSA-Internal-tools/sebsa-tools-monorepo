import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { CustomersService } from '../../../../core/services/customers.service';
import { CustomersHeroComponent } from './components/hero/customers-hero.component';
import { CustomersListComponent } from './components/list/customers-list.component';
import {
  CreateCustomerModalComponent,
  type CustomerFormData,
} from '../../components/modals/create-customer/create-customer-modal.component';
import type { Customer } from '@sebsa-pm-tool/shared-models';

@Component({
  standalone: true,
  selector: 'app-customers-page',
  imports: [
    CommonModule,
    CustomersHeroComponent,
    CustomersListComponent,
    CreateCustomerModalComponent,
  ],
  templateUrl: './customers-list.page.html',
  styleUrl: './customers-list.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomersPageComponent {
  private readonly customersService = inject(CustomersService);

  readonly customers = signal<Customer[]>([]);
  readonly isLoading = signal(false);
  readonly errorMessage = signal('');

  isModalOpen = false;
  editingCustomer: Customer | null = null;

  constructor() {
    this.loadCustomers();
  }

  private loadCustomers(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');
    this.customersService.list().subscribe({
      next: (customers) => {
        this.customers.set(customers);
        this.isLoading.set(false);
      },
      error: () => {
        this.errorMessage.set('Failed to load customers. Please try again.');
        this.isLoading.set(false);
      },
    });
  }

  openCreateModal(): void {
    this.editingCustomer = null;
    this.isModalOpen = true;
  }

  openEditModal(customer: Customer): void {
    this.editingCustomer = customer;
    this.isModalOpen = true;
  }

  closeModal(): void {
    this.isModalOpen = false;
    this.editingCustomer = null;
  }

  onSubmitCustomer(formData: CustomerFormData): void {
    this.errorMessage.set('');
    const request = this.editingCustomer
      ? this.customersService.updateCustomer(this.editingCustomer.id, formData)
      : this.customersService.createCustomer(formData);

    request.subscribe({
      next: () => {
        this.closeModal();
        this.loadCustomers();
      },
      error: (error: HttpErrorResponse) => {
        this.errorMessage.set(
          error.error?.message ?? 'Failed to save customer. Please try again.',
        );
      },
    });
  }

  onDeleteCustomer(customerId: string): void {
    this.errorMessage.set('');
    this.customersService.deleteCustomer(customerId).subscribe({
      next: () => this.loadCustomers(),
      error: (error: HttpErrorResponse) => {
        this.errorMessage.set(
          error.error?.message ?? 'Failed to delete customer. Please try again.',
        );
      },
    });
  }
}

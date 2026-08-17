import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { Customer } from '@sebsa-pm-tool/shared-models';

@Component({
  standalone: true,
  selector: 'customers-list',
  imports: [CommonModule, FormsModule],
  templateUrl: './customers-list.component.html',
  styleUrl: './customers-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomersListComponent {
  @Input() customers: Customer[] | null = null;
  @Output() newCustomerClick = new EventEmitter<void>();
  @Output() editCustomer = new EventEmitter<Customer>();
  @Output() deleteCustomer = new EventEmitter<string>();

  searchQuery = '';

  filteredCustomers(): Customer[] {
    if (!this.customers) return [];
    const term = this.searchQuery.trim().toLowerCase();
    if (!term) return this.customers;

    return this.customers.filter(
      (customer) =>
        customer.name.toLowerCase().includes(term) ||
        (customer.contactEmail ?? '').toLowerCase().includes(term),
    );
  }

  onNewCustomer(): void {
    this.newCustomerClick.emit();
  }

  onRowClick(customer: Customer, event: Event): void {
    const target = event.target as HTMLElement;
    if (target.closest('.col-actions')) {
      return;
    }
    this.editCustomer.emit(customer);
  }

  onEditCustomer(customer: Customer, event: Event): void {
    event.stopPropagation();
    this.editCustomer.emit(customer);
  }

  onDeleteCustomer(customerId: string, event: Event): void {
    event.stopPropagation();
    if (confirm('Are you sure you want to delete this customer?')) {
      this.deleteCustomer.emit(customerId);
    }
  }

  initials(name: string): string {
    return name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }
}

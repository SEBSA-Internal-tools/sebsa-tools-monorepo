import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import type {
  Customer,
  CreateCustomerRequest,
  UpdateCustomerRequest,
} from '@sebsa-pm-tool/shared-models';

@Injectable({ providedIn: 'root' })
export class CustomersService {
  private readonly http = inject(HttpClient);

  list(): Observable<Customer[]> {
    return this.http.get<Customer[]>('/api/customers');
  }

  getCustomer(id: string): Observable<Customer> {
    return this.http.get<Customer>(`/api/customers/${id}`);
  }

  createCustomer(dto: CreateCustomerRequest): Observable<Customer> {
    return this.http.post<Customer>('/api/customers', dto);
  }

  updateCustomer(id: string, dto: UpdateCustomerRequest): Observable<Customer> {
    return this.http.patch<Customer>(`/api/customers/${id}`, dto);
  }

  deleteCustomer(id: string): Observable<void> {
    return this.http.delete<void>(`/api/customers/${id}`);
  }
}

/** A customer/client a project is delivered for. Every Project belongs to
 *  exactly one Customer (see project.models.ts `ProjectSummary.customerId`). */
export interface CustomerSummary {
  id: string;
  name: string;
  contactEmail: string | null;
  contactPhone: string | null;
  notes: string | null;
  projectCount: number;
  createdAt: string;
  updatedAt: string;
}

export type Customer = CustomerSummary;

export interface CreateCustomerRequest {
  name: string;
  contactEmail?: string;
  contactPhone?: string;
  notes?: string;
}

export interface UpdateCustomerRequest {
  name?: string;
  contactEmail?: string;
  contactPhone?: string;
  notes?: string;
}

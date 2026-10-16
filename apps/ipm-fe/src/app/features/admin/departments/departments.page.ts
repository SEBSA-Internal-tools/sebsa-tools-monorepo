import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Department } from '@sebsa-pm-tool/shared-models';
import { DepartmentsService } from '../../../core/services/departments.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  standalone: true,
  selector: 'app-departments-page',
  imports: [CommonModule, FormsModule],
  templateUrl: './departments.page.html',
  styleUrl: './departments.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DepartmentsPageComponent implements OnInit {
  private readonly departmentsService = inject(DepartmentsService);
  private readonly toastService = inject(ToastService);

  protected readonly departments = signal<Department[]>([]);
  protected readonly errorMessage = signal('');
  protected readonly isModalOpen = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly isSaving = signal(false);
  protected readonly pendingDelete = signal<Department | null>(null);
  protected readonly isDeleting = signal(false);
  protected name = '';

  ngOnInit(): void {
    this.loadDepartments();
  }

  protected openCreateModal(): void {
    this.editingId.set(null);
    this.name = '';
    this.errorMessage.set('');
    this.isModalOpen.set(true);
  }

  protected openEditModal(department: Department): void {
    this.editingId.set(department.id);
    this.name = department.name;
    this.errorMessage.set('');
    this.isModalOpen.set(true);
  }

  protected closeModal(): void {
    if (this.isSaving()) return;
    this.isModalOpen.set(false);
  }

  protected submit(): void {
    const name = this.name.trim();
    if (name.length < 2 || this.isSaving()) return;

    this.errorMessage.set('');
    this.isSaving.set(true);
    const editingId = this.editingId();
    const request = editingId
      ? this.departmentsService.update(editingId, { name })
      : this.departmentsService.create({ name });

    request.subscribe({
      next: () => {
        this.isSaving.set(false);
        this.isModalOpen.set(false);
        this.loadDepartments();
        this.toastService.success(
          editingId
            ? `Department "${name}" updated successfully.`
            : `Department "${name}" created successfully.`,
        );
      },
      error: (error: HttpErrorResponse) => {
        this.isSaving.set(false);
        const message = error.error?.message ?? 'Failed to save department.';
        this.errorMessage.set(message);
        this.toastService.error(message);
      },
    });
  }

  protected openDeleteConfirmation(department: Department): void {
    this.errorMessage.set('');
    this.pendingDelete.set(department);
  }

  protected closeDeleteConfirmation(): void {
    if (this.isDeleting()) return;
    this.pendingDelete.set(null);
  }

  protected confirmDelete(): void {
    const department = this.pendingDelete();
    if (!department || this.isDeleting()) return;

    this.errorMessage.set('');
    this.isDeleting.set(true);
    this.departmentsService.remove(department.id).subscribe({
      next: () => {
        this.isDeleting.set(false);
        this.pendingDelete.set(null);
        this.loadDepartments();
        this.toastService.success(`Department "${department.name}" deleted successfully.`);
      },
      error: (error: HttpErrorResponse) => {
        this.isDeleting.set(false);
        this.pendingDelete.set(null);
        const message = error.error?.message ?? 'Failed to delete department.';
        this.errorMessage.set(message);
        this.toastService.error(message);
      },
    });
  }

  private loadDepartments(): void {
    this.departmentsService.list().subscribe({
      next: (departments) => this.departments.set(departments),
      error: () => {
        const message = 'Failed to load departments.';
        this.errorMessage.set(message);
        this.toastService.error(message);
      },
    });
  }
}

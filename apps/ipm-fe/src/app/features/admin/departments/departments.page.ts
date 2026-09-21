import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Department } from '@sebsa-pm-tool/shared-models';
import { DepartmentsService } from '../../../core/services/departments.service';

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

  protected readonly departments = signal<Department[]>([]);
  protected readonly errorMessage = signal('');
  protected readonly isModalOpen = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly isSaving = signal(false);
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
      },
      error: (error: HttpErrorResponse) => {
        this.isSaving.set(false);
        this.errorMessage.set(error.error?.message ?? 'Failed to save department.');
      },
    });
  }

  protected remove(department: Department): void {
    if (!confirm(`Delete department "${department.name}"?`)) return;

    this.errorMessage.set('');
    this.departmentsService.remove(department.id).subscribe({
      next: () => this.loadDepartments(),
      error: (error: HttpErrorResponse) =>
        this.errorMessage.set(error.error?.message ?? 'Failed to delete department.'),
    });
  }

  private loadDepartments(): void {
    this.departmentsService.list().subscribe({
      next: (departments) => this.departments.set(departments),
      error: () => this.errorMessage.set('Failed to load departments.'),
    });
  }
}

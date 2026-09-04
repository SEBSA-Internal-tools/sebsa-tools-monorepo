import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SubtaskType } from '@sebsa-pm-tool/shared-models';
import { SubtaskTypesService } from '../../../core/services/subtask-types.service';

interface SubtaskTypeFormState {
  name: string;
  description: string;
  order: number | null;
  isActive: boolean;
}

const EMPTY_FORM: SubtaskTypeFormState = { name: '', description: '', order: null, isActive: true };

@Component({
  standalone: true,
  selector: 'app-subtask-types-page',
  imports: [CommonModule, FormsModule],
  templateUrl: './subtask-types.page.html',
  styleUrl: './subtask-types.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubtaskTypesPageComponent implements OnInit {
  private readonly subtaskTypesService = inject(SubtaskTypesService);

  protected readonly types = signal<SubtaskType[]>([]);
  protected readonly errorMessage = signal('');
  protected readonly isModalOpen = signal(false);
  protected readonly editingId = signal<string | null>(null);

  protected form: SubtaskTypeFormState = { ...EMPTY_FORM };

  ngOnInit(): void {
    this.loadTypes();
  }

  private loadTypes(): void {
    this.subtaskTypesService.list().subscribe({
      next: (types) => this.types.set(types),
      error: () => this.errorMessage.set('Failed to load subtask types.'),
    });
  }

  openCreateModal(): void {
    this.editingId.set(null);
    this.form = { ...EMPTY_FORM };
    this.isModalOpen.set(true);
  }

  openEditModal(type: SubtaskType): void {
    this.editingId.set(type.id);
    this.form = {
      name: type.name,
      description: type.description ?? '',
      order: type.order,
      isActive: type.isActive,
    };
    this.isModalOpen.set(true);
  }

  closeModal(): void {
    this.isModalOpen.set(false);
  }

  submit(): void {
    this.errorMessage.set('');
    const editingId = this.editingId();
    const dto = {
      name: this.form.name,
      description: this.form.description || undefined,
      order: this.form.order ?? undefined,
      isActive: this.form.isActive,
    };

    const request = editingId
      ? this.subtaskTypesService.update(editingId, dto)
      : this.subtaskTypesService.create(dto);

    request.subscribe({
      next: () => {
        this.isModalOpen.set(false);
        this.loadTypes();
      },
      error: (error: HttpErrorResponse) =>
        this.errorMessage.set(error.error?.message ?? 'Failed to save subtask type.'),
    });
  }

  remove(type: SubtaskType): void {
    if (!confirm(`Delete subtask type "${type.name}"?`)) return;
    this.errorMessage.set('');
    this.subtaskTypesService.remove(type.id).subscribe({
      next: () => this.loadTypes(),
      error: (error: HttpErrorResponse) =>
        this.errorMessage.set(error.error?.message ?? 'Failed to delete subtask type.'),
    });
  }
}

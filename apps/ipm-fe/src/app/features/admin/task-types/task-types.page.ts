import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TaskComplexityLevel, TaskType } from '@sebsa-pm-tool/shared-models';
import { TaskTypesService } from '../../../core/services/task-types.service';

interface TaskTypeFormState {
  name: string;
  description: string;
  order: number | null;
  isActive: boolean;
}

interface ComplexityLevelFormState {
  name: string;
  color: string;
  order: number | null;
}

const EMPTY_TYPE_FORM: TaskTypeFormState = { name: '', description: '', order: null, isActive: true };
const EMPTY_LEVEL_FORM: ComplexityLevelFormState = { name: '', color: '#64748b', order: null };

@Component({
  standalone: true,
  selector: 'app-task-types-page',
  imports: [CommonModule, FormsModule],
  templateUrl: './task-types.page.html',
  styleUrl: './task-types.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskTypesPageComponent implements OnInit {
  private readonly taskTypesService = inject(TaskTypesService);

  protected readonly types = signal<TaskType[]>([]);
  protected readonly errorMessage = signal('');

  protected readonly isTypeModalOpen = signal(false);
  protected readonly editingTypeId = signal<string | null>(null);
  protected typeForm: TaskTypeFormState = { ...EMPTY_TYPE_FORM };

  protected readonly isLevelsModalOpen = signal(false);
  protected readonly activeType = signal<TaskType | null>(null);
  protected readonly editingLevelId = signal<string | null>(null);
  protected levelForm: ComplexityLevelFormState = { ...EMPTY_LEVEL_FORM };

  ngOnInit(): void {
    this.loadTypes();
  }

  private loadTypes(): void {
    this.taskTypesService.list().subscribe({
      next: (types) => {
        this.types.set(types);
        const active = this.activeType();
        if (active) {
          this.activeType.set(types.find((t) => t.id === active.id) ?? null);
        }
      },
      error: () => this.errorMessage.set('Failed to load task types.'),
    });
  }

  // --- Task Type CRUD ---

  openCreateTypeModal(): void {
    this.editingTypeId.set(null);
    this.typeForm = { ...EMPTY_TYPE_FORM };
    this.isTypeModalOpen.set(true);
  }

  openEditTypeModal(type: TaskType): void {
    this.editingTypeId.set(type.id);
    this.typeForm = {
      name: type.name,
      description: type.description ?? '',
      order: type.order,
      isActive: type.isActive,
    };
    this.isTypeModalOpen.set(true);
  }

  closeTypeModal(): void {
    this.isTypeModalOpen.set(false);
  }

  submitType(): void {
    this.errorMessage.set('');
    const editingId = this.editingTypeId();
    const dto = {
      name: this.typeForm.name,
      description: this.typeForm.description || undefined,
      order: this.typeForm.order ?? undefined,
      isActive: this.typeForm.isActive,
    };

    const request = editingId
      ? this.taskTypesService.update(editingId, dto)
      : this.taskTypesService.create(dto);

    request.subscribe({
      next: () => {
        this.isTypeModalOpen.set(false);
        this.loadTypes();
      },
      error: (error: HttpErrorResponse) =>
        this.errorMessage.set(error.error?.message ?? 'Failed to save task type.'),
    });
  }

  removeType(type: TaskType): void {
    if (!confirm(`Delete task type "${type.name}"? This also removes its complexity levels.`)) return;
    this.errorMessage.set('');
    this.taskTypesService.remove(type.id).subscribe({
      next: () => this.loadTypes(),
      error: (error: HttpErrorResponse) =>
        this.errorMessage.set(error.error?.message ?? 'Failed to delete task type.'),
    });
  }

  // --- Complexity Levels (nested under a Task Type) ---

  openLevelsModal(type: TaskType): void {
    this.activeType.set(type);
    this.editingLevelId.set(null);
    this.levelForm = { ...EMPTY_LEVEL_FORM };
    this.isLevelsModalOpen.set(true);
  }

  closeLevelsModal(): void {
    this.isLevelsModalOpen.set(false);
    this.activeType.set(null);
  }

  editLevel(level: TaskComplexityLevel): void {
    this.editingLevelId.set(level.id);
    this.levelForm = { name: level.name, color: level.color ?? '#64748b', order: level.order };
  }

  cancelEditLevel(): void {
    this.editingLevelId.set(null);
    this.levelForm = { ...EMPTY_LEVEL_FORM };
  }

  submitLevel(): void {
    const type = this.activeType();
    if (!type) return;

    this.errorMessage.set('');
    const editingLevelId = this.editingLevelId();
    const dto = {
      name: this.levelForm.name,
      color: this.levelForm.color || undefined,
      order: this.levelForm.order ?? undefined,
    };

    const request = editingLevelId
      ? this.taskTypesService.updateComplexityLevel(type.id, editingLevelId, dto)
      : this.taskTypesService.createComplexityLevel(type.id, dto);

    request.subscribe({
      next: () => {
        this.cancelEditLevel();
        this.loadTypes();
      },
      error: (error: HttpErrorResponse) =>
        this.errorMessage.set(error.error?.message ?? 'Failed to save complexity level.'),
    });
  }

  removeLevel(level: TaskComplexityLevel): void {
    const type = this.activeType();
    if (!type) return;
    if (!confirm(`Delete complexity level "${level.name}"?`)) return;

    this.errorMessage.set('');
    this.taskTypesService.removeComplexityLevel(type.id, level.id).subscribe({
      next: () => this.loadTypes(),
      error: (error: HttpErrorResponse) =>
        this.errorMessage.set(error.error?.message ?? 'Failed to delete complexity level.'),
    });
  }
}

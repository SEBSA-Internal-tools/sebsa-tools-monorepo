import { ChangeDetectionStrategy, Component, Input, OnChanges, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ConfigKind, ConfigOption, ConfigScope } from '@sebsa-pm-tool/shared-models';
import { ConfigOptionsService } from '../../services/config-options.service';
import { ToastService } from '../../services/toast.service';
import { AuthService } from '../../services/auth.service';

interface ConfigList {
  kind: ConfigKind;
  title: string;
  description: string;
  icon: string;
  /** Status lists carry completion semantics and a meaningful order; type and
   * priority lists have neither. */
  isStatusList: boolean;
}

const CONFIG_LISTS: ConfigList[] = [
  {
    kind: 'PRIORITY', title: 'Priorities', icon: 'flag', isStatusList: false,
    description: 'Priority levels available on cases and tasks.',
  },
  {
    kind: 'PROJECT_TYPE', title: 'Project Types', icon: 'category', isStatusList: false,
    description: 'Classification offered when creating a project.',
  },
  {
    kind: 'PROJECT_STATUS', title: 'Project Statuses', icon: 'donut_large', isStatusList: true,
    description: 'Lifecycle stages a project moves through.',
  },
  {
    kind: 'CASE_TYPE', title: 'Case Types', icon: 'label', isStatusList: false,
    description: 'Epic, Story, Bug and any other case classification.',
  },
  {
    kind: 'CASE_STATUS', title: 'Case Statuses', icon: 'swap_horiz', isStatusList: true,
    description: 'Columns on the case board and the case status stepper.',
  },
  {
    kind: 'TASK_STATUS', title: 'Task Statuses', icon: 'task_alt', isStatusList: true,
    description: 'Lifecycle stages a task moves through.',
  },
  {
    kind: 'SUBTASK_STATUS', title: 'Subtask Statuses', icon: 'checklist', isStatusList: true,
    description: 'Lifecycle stages a subtask moves through.',
  },
  {
    kind: 'TASK_TYPE', title: 'Task Types', icon: 'assignment', isStatusList: false,
    description: 'Classification offered when creating a task.',
  },
  {
    kind: 'SUBTASK_TYPE', title: 'Subtask Types', icon: 'subdirectory_arrow_right', isStatusList: false,
    description: 'Classification offered when creating a subtask.',
  },
];

interface DraftOption {
  label: string;
  color: string;
  isCompleted: boolean;
  isCancelled: boolean;
}

const EMPTY_DRAFT: DraftOption = {
  label: '', color: '#64748B', isCompleted: false, isCancelled: false,
};

/**
 * Manages every configurable list for one scope. Mounted twice — once under
 * System for GLOBAL, once as a CSO tab for CSO — differing only by `scope`.
 */
@Component({
  standalone: true,
  selector: 'app-configuration-panel',
  imports: [CommonModule, FormsModule],
  templateUrl: './configuration-panel.component.html',
  styleUrl: './configuration-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfigurationPanelComponent implements OnChanges {
  @Input({ required: true }) scope!: ConfigScope;

  private readonly configOptions = inject(ConfigOptionsService);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);

  protected readonly lists = CONFIG_LISTS;
  protected readonly options = signal<ConfigOption[]>([]);
  protected readonly isLoading = signal(false);
  protected readonly errorMessage = signal('');

  protected readonly activeKind = signal<ConfigKind>('PRIORITY');
  protected readonly editingId = signal<string | null>(null);
  protected readonly isAdding = signal(false);

  protected readonly draggingId = signal<string | null>(null);
  protected readonly dropTargetId = signal<string | null>(null);

  protected draft: DraftOption = { ...EMPTY_DRAFT };

  /** Writes are Super Admin only; everyone else sees the lists read-only. */
  protected readonly canEdit = computed(
    () => this.auth.currentUser()?.systemRole === 'SUPER_ADMIN',
  );

  ngOnChanges(): void {
    this.resetEditors();
    this.load();
  }

  protected get activeList(): ConfigList {
    return this.lists.find((list) => list.kind === this.activeKind()) ?? this.lists[0];
  }

  protected optionsFor(kind: ConfigKind): ConfigOption[] {
    return this.options().filter((option) => option.kind === kind);
  }

  protected load(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    // includeInactive so admins can see and re-enable what they turned off.
    this.configOptions.list(this.scope, { includeInactive: true }).subscribe({
      next: (options) => {
        this.options.set(options);
        this.isLoading.set(false);
      },
      error: () => {
        this.errorMessage.set('Could not load configuration. Please try again.');
        this.isLoading.set(false);
      },
    });
  }

  protected selectKind(kind: ConfigKind): void {
    this.activeKind.set(kind);
    this.resetEditors();
  }

  protected startAdd(): void {
    this.draft = { ...EMPTY_DRAFT };
    this.isAdding.set(true);
    this.editingId.set(null);
  }

  protected startEdit(option: ConfigOption): void {
    this.draft = {
      label: option.label,
      color: option.color ?? EMPTY_DRAFT.color,
      isCompleted: option.isCompleted,
      isCancelled: option.isCancelled,
    };
    this.editingId.set(option.id);
    this.isAdding.set(false);
  }

  protected cancelEdit(): void {
    this.resetEditors();
  }

  protected save(): void {
    const label = this.draft.label.trim();
    if (!label) return;

    const editingId = this.editingId();
    const flags = this.activeList.isStatusList
      ? { isCompleted: this.draft.isCompleted, isCancelled: this.draft.isCancelled }
      : {};

    const request = editingId
      ? this.configOptions.update(editingId, { label, color: this.draft.color, ...flags })
      : this.configOptions.create({
          kind: this.activeKind(),
          scope: this.scope,
          label,
          color: this.draft.color,
          ...flags,
        });

    request.subscribe({
      next: () => {
        this.toast.success(editingId ? 'Configuration updated.' : 'Entry added.');
        this.resetEditors();
        this.load();
      },
      error: (error: HttpErrorResponse) =>
        this.toast.error(error.error?.message ?? 'Could not save the change.'),
    });
  }

  protected setDefault(option: ConfigOption): void {
    this.configOptions.update(option.id, { isDefault: true }).subscribe({
      next: () => {
        this.toast.success(`"${option.label}" is now the default.`);
        this.load();
      },
      error: (error: HttpErrorResponse) =>
        this.toast.error(error.error?.message ?? 'Could not set the default.'),
    });
  }

  protected toggleActive(option: ConfigOption): void {
    this.configOptions.update(option.id, { isActive: !option.isActive }).subscribe({
      next: () => this.load(),
      error: (error: HttpErrorResponse) =>
        this.toast.error(error.error?.message ?? 'Could not change availability.'),
    });
  }

  protected remove(option: ConfigOption): void {
    if (!window.confirm(`Delete "${option.label}"? This cannot be undone.`)) return;

    this.configOptions.delete(option.id).subscribe({
      next: () => {
        this.toast.success('Entry deleted.');
        this.load();
      },
      error: (error: HttpErrorResponse) =>
        this.toast.error(error.error?.message ?? 'Could not delete the entry.'),
    });
  }

  /** Only lists with a meaningful sequence can be dragged; a type list is just
   * a set of choices. */
  protected get isReorderable(): boolean {
    return this.activeList.isStatusList || this.activeKind() === 'PRIORITY';
  }

  protected onDragStart(option: ConfigOption): void {
    this.draggingId.set(option.id);
  }

  protected onDragEnd(): void {
    this.draggingId.set(null);
    this.dropTargetId.set(null);
  }

  protected onDragOver(event: DragEvent, option: ConfigOption): void {
    if (!this.draggingId() || this.draggingId() === option.id) return;
    // Without this the browser refuses the drop.
    event.preventDefault();
    this.dropTargetId.set(option.id);
  }

  protected onDrop(event: DragEvent, target: ConfigOption): void {
    event.preventDefault();

    const draggedId = this.draggingId();
    this.onDragEnd();
    if (!draggedId || draggedId === target.id) return;

    const list = this.optionsFor(target.kind);
    const from = list.findIndex((entry) => entry.id === draggedId);
    const to = list.findIndex((entry) => entry.id === target.id);
    if (from < 0 || to < 0) return;

    const reordered = [...list];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);

    // Reflect the new order straight away; the reload confirms it.
    this.options.update((all) => {
      const others = all.filter((entry) => entry.kind !== target.kind);
      return [...others, ...reordered.map((entry, index) => ({ ...entry, order: index + 1 }))];
    });

    // The API rejects a partial list, so the whole ordering goes with it.
    this.configOptions
      .reorder(target.kind, this.scope, { orderedIds: reordered.map((entry) => entry.id) })
      .subscribe({
        next: () => this.load(),
        error: (error: HttpErrorResponse) => {
          this.toast.error(error.error?.message ?? 'Could not reorder the list.');
          this.load();
        },
      });
  }

  protected trackById(_index: number, option: ConfigOption): string {
    return option.id;
  }

  private resetEditors(): void {
    this.draft = { ...EMPTY_DRAFT };
    this.editingId.set(null);
    this.isAdding.set(false);
  }
}

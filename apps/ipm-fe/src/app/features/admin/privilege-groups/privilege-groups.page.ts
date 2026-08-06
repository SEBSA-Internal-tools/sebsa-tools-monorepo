import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PrivilegeGroup } from '@sebsa-pm-tool/shared-models';
import { PrivilegeGroupsService } from '../../../core/services/privilege-groups.service';

interface PrivilegeGroupFormState {
  name: string;
  description: string;
  canCreateTask: boolean;
  canDeleteTask: boolean;
  canManageMembers: boolean;
  canConfigureIntegrations: boolean;
  canManageWorkflow: boolean;
  isReadOnly: boolean;
}

const EMPTY_FORM: PrivilegeGroupFormState = {
  name: '',
  description: '',
  canCreateTask: false,
  canDeleteTask: false,
  canManageMembers: false,
  canConfigureIntegrations: false,
  canManageWorkflow: false,
  isReadOnly: false,
};

@Component({
  standalone: true,
  selector: 'app-privilege-groups-page',
  imports: [CommonModule, FormsModule],
  templateUrl: './privilege-groups.page.html',
  styleUrl: './privilege-groups.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrivilegeGroupsPageComponent implements OnInit {
  private readonly privilegeGroupsService = inject(PrivilegeGroupsService);

  protected readonly groups = signal<PrivilegeGroup[]>([]);
  protected readonly errorMessage = signal('');
  protected readonly isModalOpen = signal(false);
  protected readonly editingId = signal<string | null>(null);

  protected form: PrivilegeGroupFormState = { ...EMPTY_FORM };

  ngOnInit(): void {
    this.loadGroups();
  }

  private loadGroups(): void {
    this.privilegeGroupsService.list().subscribe({
      next: (groups) => this.groups.set(groups),
      error: () => this.errorMessage.set('Failed to load privilege groups.'),
    });
  }

  openCreateModal(): void {
    this.editingId.set(null);
    this.form = { ...EMPTY_FORM };
    this.isModalOpen.set(true);
  }

  openEditModal(group: PrivilegeGroup): void {
    this.editingId.set(group.id);
    this.form = {
      name: group.name,
      description: group.description ?? '',
      canCreateTask: group.canCreateTask,
      canDeleteTask: group.canDeleteTask,
      canManageMembers: group.canManageMembers,
      canConfigureIntegrations: group.canConfigureIntegrations,
      canManageWorkflow: group.canManageWorkflow,
      isReadOnly: group.isReadOnly,
    };
    this.isModalOpen.set(true);
  }

  closeModal(): void {
    this.isModalOpen.set(false);
  }

  submit(): void {
    this.errorMessage.set('');
    const editingId = this.editingId();
    const dto = { ...this.form, description: this.form.description || undefined };

    const request = editingId
      ? this.privilegeGroupsService.update(editingId, dto)
      : this.privilegeGroupsService.create(dto);

    request.subscribe({
      next: () => {
        this.isModalOpen.set(false);
        this.loadGroups();
      },
      error: (error: HttpErrorResponse) =>
        this.errorMessage.set(error.error?.message ?? 'Failed to save privilege group.'),
    });
  }

  remove(group: PrivilegeGroup): void {
    if (!confirm(`Delete privilege group "${group.name}"?`)) return;
    this.errorMessage.set('');
    this.privilegeGroupsService.remove(group.id).subscribe({
      next: () => this.loadGroups(),
      error: (error: HttpErrorResponse) =>
        this.errorMessage.set(error.error?.message ?? 'Failed to delete privilege group.'),
    });
  }
}

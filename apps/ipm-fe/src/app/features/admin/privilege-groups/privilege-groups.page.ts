import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PrivilegeGrants, PrivilegeGroup } from '@sebsa-pm-tool/shared-models';
import { PrivilegeGroupsService } from '../../../core/services/privilege-groups.service';
import { ConfirmationService } from '../../../core/services/confirmation.service';

type GrantKey = keyof PrivilegeGrants;

interface PermissionDef {
  key: GrantKey;
  label: string;
  hint?: string;
}

interface PermissionSection {
  title: string;
  permissions: PermissionDef[];
}

/** Rendered from data rather than hand-listed, so adding a grant means adding
 * one entry here instead of editing a form, a badge list and a reset object. */
const PERMISSION_SECTIONS: PermissionSection[] = [
  {
    title: 'Cases',
    permissions: [
      { key: 'canCreateCase', label: 'Create cases' },
      { key: 'canEditCase', label: 'Edit cases' },
      { key: 'canDeleteCase', label: 'Delete cases' },
    ],
  },
  {
    title: 'Tasks & subtasks',
    permissions: [
      { key: 'canCreateTask', label: 'Create tasks', hint: 'Includes subtasks' },
      { key: 'canEditTask', label: 'Edit tasks', hint: 'Includes subtasks' },
      { key: 'canDeleteTask', label: 'Delete tasks', hint: 'Includes subtasks' },
    ],
  },
  {
    title: 'Collaboration',
    permissions: [{ key: 'canComment', label: 'Comment' }],
  },
  {
    title: 'Project management',
    permissions: [
      { key: 'canManageMembers', label: 'Manage members' },
      { key: 'canManageSprints', label: 'Manage sprints' },
      { key: 'canManageLabels', label: 'Manage labels' },
      { key: 'canConfigureIntegrations', label: 'Configure integrations', hint: 'Jira linking' },
    ],
  },
];

const ALL_GRANTS: GrantKey[] = PERMISSION_SECTIONS.flatMap((s) =>
  s.permissions.map((p) => p.key),
);

interface PrivilegeGroupFormState extends PrivilegeGrants {
  name: string;
  description: string;
  isReadOnly: boolean;
}

/** Builds a full PrivilegeGrants from a per-key lookup. Written this way so the
 * result is genuinely typed rather than an asserted string map. */
function buildGrants(valueFor: (key: GrantKey) => boolean): PrivilegeGrants {
  const grants = {} as PrivilegeGrants;
  for (const key of ALL_GRANTS) {
    grants[key] = valueFor(key);
  }
  return grants;
}

function emptyForm(): PrivilegeGroupFormState {
  return { ...buildGrants(() => false), name: '', description: '', isReadOnly: false };
}

@Component({
  standalone: true,
  selector: 'app-privilege-groups-page',
  imports: [CommonModule, FormsModule],
  templateUrl: './privilege-groups.page.html',
  styleUrl: './privilege-groups.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrivilegeGroupsPageComponent implements OnInit {
  private readonly confirmation = inject(ConfirmationService);
  private readonly privilegeGroupsService = inject(PrivilegeGroupsService);

  protected readonly sections = PERMISSION_SECTIONS;
  readonly groups = signal<PrivilegeGroup[]>([]);
  readonly isLoading = signal(false);
  readonly errorMessage = signal('');
  readonly editingId = signal<string | null>(null);
  readonly isModalOpen = signal(false);

  form: PrivilegeGroupFormState = emptyForm();

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');
    this.privilegeGroupsService.list().subscribe({
      next: (groups) => {
        this.groups.set(groups);
        this.isLoading.set(false);
      },
      error: () => {
        this.errorMessage.set('Could not load privilege groups.');
        this.isLoading.set(false);
      },
    });
  }

  /** The grants a group actually carries, for the badge row. A read-only group
   * shows none, because none of them apply. */
  grantedPermissions(group: PrivilegeGroup): PermissionDef[] {
    if (group.isReadOnly) return [];
    return PERMISSION_SECTIONS.flatMap((s) => s.permissions).filter((p) => group[p.key]);
  }

  openCreateModal(): void {
    this.form = emptyForm();
    this.editingId.set(null);
    this.isModalOpen.set(true);
  }

  openEditModal(group: PrivilegeGroup): void {
    const grants = buildGrants((key) => group[key]);

    this.form = {
      ...grants,
      name: group.name,
      description: group.description ?? '',
      isReadOnly: group.isReadOnly,
    };
    this.editingId.set(group.id);
    this.isModalOpen.set(true);
  }

  closeModal(): void {
    this.isModalOpen.set(false);
    this.editingId.set(null);
    this.form = emptyForm();
  }

  /** Read-only denies every write server-side, so the grants are switched off
   * here too rather than left ticked but inert. */
  onReadOnlyChange(): void {
    if (!this.form.isReadOnly) return;
    for (const key of ALL_GRANTS) {
      this.form[key] = false;
    }
  }

  submit(): void {
    const name = this.form.name.trim();
    if (!name) return;

    const grants = buildGrants((key) => this.form[key]);

    const payload = {
      ...grants,
      name,
      description: this.form.description.trim() || undefined,
      isReadOnly: this.form.isReadOnly,
    };

    const editingId = this.editingId();
    const request = editingId
      ? this.privilegeGroupsService.update(editingId, payload)
      : this.privilegeGroupsService.create(payload);

    request.subscribe({
      next: () => {
        this.closeModal();
        this.load();
      },
      error: (error: HttpErrorResponse) =>
        this.errorMessage.set(error.error?.message ?? 'Could not save the privilege group.'),
    });
  }

  async remove(group: PrivilegeGroup): Promise<void> {
    if (!(await this.confirmation.confirm({ title: 'Delete privilege group', message: `Delete "${group.name}"?`, consequence: 'This privilege group will be permanently removed. Users assigned to it may lose its permissions.', confirmLabel: 'Delete group' }))) return;
    this.errorMessage.set('');
    this.privilegeGroupsService.remove(group.id).subscribe({
      next: () => this.load(),
      error: (error: HttpErrorResponse) =>
        this.errorMessage.set(
          error.error?.message ?? 'Could not delete the privilege group.',
        ),
    });
  }

  trackById(_index: number, group: PrivilegeGroup): string {
    return group.id;
  }
}

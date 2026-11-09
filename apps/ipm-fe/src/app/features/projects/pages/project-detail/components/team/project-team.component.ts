import {
  Component,
  Input,
  ChangeDetectionStrategy,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ProjectsService } from '../../../../services/projects.service';
import { PrivilegeGroupsService } from '../../../../../../core/services/privilege-groups.service';
import { ConfirmationService } from '../../../../../../core/services/confirmation.service';
import {
  AssignUserModalComponent,
  AssignUserFormData,
} from '../../../../components/modals/assign-user/assign-user-modal.component';
import { UserAvatarComponent } from '../../../../../../core/components/user-avatar/user-avatar.component';
import { CustomSelectComponent } from '../../../../../../core/components/custom-select/custom-select.component';
import type { PrivilegeGroup, ProjectMemberSummary, ProjectRole } from '@sebsa-pm-tool/shared-models';

@Component({
  standalone: true,
  selector: 'project-team',
  imports: [CommonModule, FormsModule, AssignUserModalComponent, UserAvatarComponent, CustomSelectComponent],
  templateUrl: './project-team.component.html',
  styleUrl: './project-team.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectTeamComponent implements OnInit {
  private readonly confirmation = inject(ConfirmationService);
  @Input() projectId!: string;
  /** False = read-only: no add, remove, or role changes. */
  @Input() canManage = false;

  private readonly projectsService = inject(ProjectsService);
  private readonly privilegeGroupsService = inject(PrivilegeGroupsService);

  isModalOpen = signal(false);
  teamMembers = signal<ProjectMemberSummary[]>([]);
  errorMessage = signal('');

  roles = signal<ProjectRole[]>([]);
  privilegeGroups = signal<PrivilegeGroup[]>([]);
  rolesErrorMessage = signal('');
  isCreatingRole = signal(false);

  newRoleName = '';
  newRoleGroupId = '';

  viewMode = signal<'card' | 'list'>('list');

  toggleViewMode(mode: 'card' | 'list'): void {
    this.viewMode.set(mode);
  }

  ngOnInit(): void {
    this.loadMembers();
    this.loadRoles();
    this.privilegeGroupsService.list().subscribe({
      next: (groups) => this.privilegeGroups.set(groups),
      error: () =>
        this.rolesErrorMessage.set(
          'Failed to load privilege groups. Custom roles cannot be created right now.',
        ),
    });
  }

  private loadMembers(): void {
    this.projectsService.getMembers(this.projectId).subscribe({
      next: (members) => this.teamMembers.set(members),
      error: () => this.errorMessage.set('Failed to load team members.'),
    });
  }

  private loadRoles(): void {
    this.projectsService.getRoles(this.projectId).subscribe({
      next: (roles) => this.roles.set(roles),
      error: () => this.rolesErrorMessage.set('Failed to load roles.'),
    });
  }

  onOpenModal(): void {
    this.isModalOpen.set(true);
  }

  onCloseModal(): void {
    this.isModalOpen.set(false);
  }

  onAssignUsers(formData: AssignUserFormData): void {
    this.errorMessage.set('');
    formData.users.forEach((user) => {
      this.projectsService
        .addMember(this.projectId, { userId: user.id, roleId: formData.roleId })
        .subscribe({
          next: () => this.loadMembers(),
          error: () => this.errorMessage.set(`Failed to add ${user.name}.`),
        });
    });
    this.isModalOpen.set(false);
  }

  async onRemoveMember(memberId: string): Promise<void> {
    const member = this.teamMembers().find((item) => item.id === memberId);
    if (!(await this.confirmation.confirm({ title: 'Remove project member', message: `Remove ${member?.user.name ?? 'this member'} from the project?`, consequence: 'This person will lose access through this project membership. Their account will remain.', confirmLabel: 'Remove member' }))) return;

    this.errorMessage.set('');
    this.projectsService.removeMember(this.projectId, memberId).subscribe({
      next: () => this.loadMembers(),
      error: () => this.errorMessage.set('Failed to remove member.'),
    });
  }

  reassignRole(role: ProjectRole, privilegeGroupId: string): void {
    if (!privilegeGroupId || privilegeGroupId === role.privilegeGroup.id) return;

    this.rolesErrorMessage.set('');
    this.projectsService.updateRole(this.projectId, role.id, { privilegeGroupId }).subscribe({
      next: () => this.loadRoles(),
      error: (error: HttpErrorResponse) =>
        this.rolesErrorMessage.set(
          error.error?.message ?? `Failed to reassign "${role.name}".`,
        ),
    });
  }

  createRole(): void {
    const name = this.newRoleName.trim();
    if (!name) {
      this.rolesErrorMessage.set('Enter a name for the custom role.');
      return;
    }
    if (!this.newRoleGroupId) {
      this.rolesErrorMessage.set('Select a privilege group for the custom role.');
      return;
    }
    if (this.isCreatingRole()) return;

    this.rolesErrorMessage.set('');
    this.isCreatingRole.set(true);
    this.projectsService
      .createRole(this.projectId, { name, privilegeGroupId: this.newRoleGroupId })
      .subscribe({
        next: (role) => {
          this.roles.update((roles) => [...roles, role]);
          this.newRoleName = '';
          this.newRoleGroupId = '';
          this.isCreatingRole.set(false);
        },
        error: (error: HttpErrorResponse) => {
          const message = error.error?.message;
          this.rolesErrorMessage.set(
            Array.isArray(message)
              ? message.join(' ')
              : message ?? 'Failed to create role.',
          );
          this.isCreatingRole.set(false);
        },
      });
  }
}

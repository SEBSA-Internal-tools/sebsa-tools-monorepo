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
import {
  AssignUserModalComponent,
  AssignUserFormData,
} from '../../../../components/modals/assign-user/assign-user-modal.component';
import type { PrivilegeGroup, ProjectMemberSummary, ProjectRole } from '@sebsa-pm-tool/shared-models';

@Component({
  standalone: true,
  selector: 'project-team',
  imports: [CommonModule, FormsModule, AssignUserModalComponent],
  templateUrl: './project-team.component.html',
  styleUrl: './project-team.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectTeamComponent implements OnInit {
  @Input() projectId!: string;

  private readonly projectsService = inject(ProjectsService);
  private readonly privilegeGroupsService = inject(PrivilegeGroupsService);

  isModalOpen = signal(false);
  teamMembers = signal<ProjectMemberSummary[]>([]);
  errorMessage = signal('');

  roles = signal<ProjectRole[]>([]);
  privilegeGroups = signal<PrivilegeGroup[]>([]);
  rolesErrorMessage = signal('');

  newRoleName = '';
  newRoleGroupId = '';

  ngOnInit(): void {
    this.loadMembers();
    this.loadRoles();
    this.privilegeGroupsService.list().subscribe({
      next: (groups) => this.privilegeGroups.set(groups),
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

  initials(name: string): string {
    return name
      .split(' ')
      .map((n: string) => n[0])
      .join('')
      .toUpperCase();
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

  onRemoveMember(memberId: string): void {
    if (!confirm('Remove this member from the project?')) return;

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
    if (!this.newRoleName.trim() || !this.newRoleGroupId) return;

    this.rolesErrorMessage.set('');
    this.projectsService
      .createRole(this.projectId, { name: this.newRoleName, privilegeGroupId: this.newRoleGroupId })
      .subscribe({
        next: () => {
          this.newRoleName = '';
          this.newRoleGroupId = '';
          this.loadRoles();
        },
        error: (error: HttpErrorResponse) =>
          this.rolesErrorMessage.set(error.error?.message ?? 'Failed to create role.'),
      });
  }
}

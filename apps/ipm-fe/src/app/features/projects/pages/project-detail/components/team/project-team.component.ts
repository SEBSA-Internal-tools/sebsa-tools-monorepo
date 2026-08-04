import {
  Component,
  Input,
  ChangeDetectionStrategy,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProjectsService } from '../../../../services/projects.service';
import {
  AssignUserModalComponent,
  AssignUserFormData,
} from '../../../../components/modals/assign-user/assign-user-modal.component';
import type { ProjectMemberSummary } from '@sebsa-pm-tool/shared-models';

@Component({
  standalone: true,
  selector: 'project-team',
  imports: [CommonModule, AssignUserModalComponent],
  templateUrl: './project-team.component.html',
  styleUrl: './project-team.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectTeamComponent implements OnInit {
  @Input() projectId!: string;

  private readonly projectsService = inject(ProjectsService);

  isModalOpen = signal(false);
  teamMembers = signal<ProjectMemberSummary[]>([]);
  errorMessage = signal('');

  ngOnInit(): void {
    this.loadMembers();
  }

  private loadMembers(): void {
    this.projectsService.getMembers(this.projectId).subscribe({
      next: (members) => this.teamMembers.set(members),
      error: () => this.errorMessage.set('Failed to load team members.'),
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
}

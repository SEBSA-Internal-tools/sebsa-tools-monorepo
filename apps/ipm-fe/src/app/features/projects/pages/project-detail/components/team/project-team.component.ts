import {
  Component,
  Input,
  ChangeDetectionStrategy,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  AssignUserModalComponent,
  AssignUserFormData,
  AssignedUser,
} from '../../../../components/modals/assign-user/assign-user-modal.component';

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  email: string;
  avatar: string;
  status: 'active' | 'away' | 'offline';
  joinDate: string;
}

@Component({
  standalone: true,
  selector: 'project-team',
  imports: [CommonModule, AssignUserModalComponent],
  templateUrl: './project-team.component.html',
  styleUrl: './project-team.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectTeamComponent {
  @Input() projectId!: string;

  isModalOpen = signal(false);
  teamMembers = signal<TeamMember[]>([
    {
      id: '1',
      name: 'Sarah Miller',
      role: 'Project Manager',
      email: 'sarah.miller@sebsa.com',
      avatar: 'SM',
      status: 'active',
      joinDate: 'Jan 15, 2024',
    },
    {
      id: '2',
      name: 'James Chen',
      role: 'Lead Developer',
      email: 'james.chen@sebsa.com',
      avatar: 'JC',
      status: 'active',
      joinDate: 'Feb 10, 2024',
    },
    {
      id: '3',
      name: 'Emma Rodriguez',
      role: 'QA Engineer',
      email: 'emma.rodriguez@sebsa.com',
      avatar: 'ER',
      status: 'active',
      joinDate: 'Mar 5, 2024',
    },
    {
      id: '4',
      name: 'David Kim',
      role: 'Backend Developer',
      email: 'david.kim@sebsa.com',
      avatar: 'DK',
      status: 'away',
      joinDate: 'Jan 20, 2024',
    },
    {
      id: '5',
      name: 'Lisa Anderson',
      role: 'UI/UX Designer',
      email: 'lisa.anderson@sebsa.com',
      avatar: 'LA',
      status: 'offline',
      joinDate: 'Feb 28, 2024',
    },
  ]);

  getStatusIcon(status: string): string {
    switch (status) {
      case 'active':
        return 'check_circle';
      case 'away':
        return 'schedule';
      case 'offline':
        return 'cancel';
      default:
        return 'help';
    }
  }

  getStatusClass(status: string): string {
    return status.toLowerCase();
  }

  onOpenModal(): void {
    this.isModalOpen.set(true);
  }

  onCloseModal(): void {
    this.isModalOpen.set(false);
  }

  onAssignUsers(formData: AssignUserFormData): void {
    const newMembers = formData.users.map((user: AssignedUser) => ({
      id: user.id,
      name: user.name,
      role: user.position,
      email: user.email,
      avatar: this.generateAvatar(user.name),
      status: 'active' as const,
      joinDate: new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
    }));

    this.teamMembers.update(members => [...members, ...newMembers]);
    this.isModalOpen.set(false);
  }

  private generateAvatar(name: string): string {
    return name
      .split(' ')
      .map((n: string) => n[0])
      .join('')
      .toUpperCase();
  }
}

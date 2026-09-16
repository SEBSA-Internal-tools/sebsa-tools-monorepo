import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  ChangeDetectionStrategy,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UsersService } from '../../../../../core/services/users.service';
import { ProjectsService } from '../../../services/projects.service';
import { CustomSelectComponent } from '../../../../../core/components/custom-select/custom-select.component';
import { UserAvatarComponent } from '../../../../../core/components/user-avatar/user-avatar.component';
import type { ProjectRole, UserSummary } from '@sebsa-pm-tool/shared-models';

export type AssignedUser = UserSummary;

export interface AssignUserFormData {
  users: AssignedUser[];
  roleId: string;
}

@Component({
  standalone: true,
  selector: 'assign-user-modal',
  imports: [CommonModule, FormsModule, CustomSelectComponent, UserAvatarComponent],
  templateUrl: './assign-user-modal.component.html',
  styleUrl: './assign-user-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssignUserModalComponent implements OnChanges {
  private readonly usersService = inject(UsersService);
  private readonly projectsService = inject(ProjectsService);

  @Input() isOpen = false;
  @Input() projectId = '';
  @Output() close = new EventEmitter<void>();
  @Output() submit = new EventEmitter<AssignUserFormData>();

  emailInput = '';
  selectedUsers = signal<AssignedUser[]>([]);
  isLoading = signal(false);
  errorMessage = signal('');
  successMessage = signal('');

  readonly availableRoles = signal<ProjectRole[]>([]);
  selectedRoleId = '';

  ngOnChanges(): void {
    if (this.isOpen && this.projectId) {
      this.projectsService.getRoles(this.projectId).subscribe({
        next: (roles) => {
          this.availableRoles.set(roles);
          const memberRole = roles.find((role) => role.name === 'Member');
          this.selectedRoleId = memberRole?.id ?? roles[0]?.id ?? '';
        },
        error: () => this.availableRoles.set([]),
      });
    }
  }

  onAddUser(): void {
    const email = this.emailInput.trim().toLowerCase();

    this.clearMessages();

    if (!email) {
      this.errorMessage.set('Please enter an email address');
      return;
    }

    if (this.selectedUsers().some((u) => u.email.toLowerCase() === email)) {
      this.errorMessage.set('This user is already added');
      return;
    }

    this.isLoading.set(true);

    this.usersService.search(email).subscribe({
      next: (results) => {
        const user = results.find((u) => u.email.toLowerCase() === email);
        this.isLoading.set(false);
        if (user) {
          this.selectedUsers.update((users) => [...users, user]);
          this.emailInput = '';
          this.successMessage.set(`${user.name} has been added to the list`);
        } else {
          this.errorMessage.set('User not found. Please check the email address');
        }
      },
      error: () => {
        this.isLoading.set(false);
        this.errorMessage.set('Could not look up that user. Please try again.');
      },
    });
  }

  onRemoveUser(userId: string): void {
    this.selectedUsers.update((users) => users.filter((u) => u.id !== userId));
    this.clearMessages();
  }

  onCancel(): void {
    this.resetForm();
    this.close.emit();
  }

  onSubmit(): void {
    if (this.selectedUsers().length === 0) {
      this.errorMessage.set('Please add at least one user');
      return;
    }
    if (!this.selectedRoleId) {
      this.errorMessage.set('Please select a role');
      return;
    }

    const formData: AssignUserFormData = {
      users: this.selectedUsers(),
      roleId: this.selectedRoleId,
    };

    this.submit.emit(formData);
    this.resetForm();
  }

  onBackdropClick(): void {
    this.onCancel();
  }

  private resetForm(): void {
    this.emailInput = '';
    this.selectedUsers.set([]);
    this.clearMessages();
  }

  private clearMessages(): void {
    this.errorMessage.set('');
    this.successMessage.set('');
  }

  isEmailValid(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

}

import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface AssignedUser {
  id: string;
  name: string;
  email: string;
  position: string;
}

export interface AssignUserFormData {
  users: AssignedUser[];
}

@Component({
  standalone: true,
  selector: 'assign-user-modal',
  imports: [CommonModule, FormsModule],
  templateUrl: './assign-user-modal.component.html',
  styleUrl: './assign-user-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssignUserModalComponent {
  @Input() isOpen = false;
  @Input() projectId = '';
  @Output() close = new EventEmitter<void>();
  @Output() submit = new EventEmitter<AssignUserFormData>();

  emailInput = '';
  selectedUsers = signal<AssignedUser[]>([]);
  isLoading = signal(false);
  errorMessage = signal('');
  successMessage = signal('');

  // Mock backend data - in real app, this would come from an API
  private mockUserDatabase: Record<string, AssignedUser> = {
    'sarah.miller@sebsa.com': {
      id: '1',
      name: 'Sarah Miller',
      email: 'sarah.miller@sebsa.com',
      position: 'Project Manager',
    },
    'james.chen@sebsa.com': {
      id: '2',
      name: 'James Chen',
      email: 'james.chen@sebsa.com',
      position: 'Lead Developer',
    },
    'emma.rodriguez@sebsa.com': {
      id: '3',
      name: 'Emma Rodriguez',
      email: 'emma.rodriguez@sebsa.com',
      position: 'QA Engineer',
    },
    'david.kim@sebsa.com': {
      id: '4',
      name: 'David Kim',
      email: 'david.kim@sebsa.com',
      position: 'Backend Developer',
    },
    'lisa.anderson@sebsa.com': {
      id: '5',
      name: 'Lisa Anderson',
      email: 'lisa.anderson@sebsa.com',
      position: 'UI/UX Designer',
    },
    'michael.brown@sebsa.com': {
      id: '6',
      name: 'Michael Brown',
      email: 'michael.brown@sebsa.com',
      position: 'DevOps Engineer',
    },
  };

  onAddUser(): void {
    const email = this.emailInput.trim().toLowerCase();

    this.clearMessages();

    if (!email) {
      this.errorMessage.set('Please enter an email address');
      return;
    }

    // Check if user already added
    if (this.selectedUsers().some(u => u.email.toLowerCase() === email)) {
      this.errorMessage.set('This user is already added');
      return;
    }

    this.isLoading.set(true);

    // Simulate API call with timeout
    setTimeout(() => {
      const user = this.mockUserDatabase[email];

      if (user) {
        this.selectedUsers.update(users => [...users, user]);
        this.emailInput = '';
        this.successMessage.set(
          `${user.name} has been added to the project`
        );
        this.isLoading.set(false);
      } else {
        this.errorMessage.set(
          'User not found. Please check the email address'
        );
        this.isLoading.set(false);
      }
    }, 800);
  }

  onRemoveUser(userId: string): void {
    this.selectedUsers.update(users => users.filter(u => u.id !== userId));
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

    const formData: AssignUserFormData = {
      users: this.selectedUsers(),
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

  getUserInitials(name: string): string {
    return name
      .split(' ')
      .map((n: string) => n[0])
      .join('')
      .toUpperCase();
  }
}

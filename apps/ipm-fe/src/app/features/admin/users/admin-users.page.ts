import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CreateUserResponse, Department, SystemRole, UserAdminSummary } from '@sebsa-pm-tool/shared-models';
import { AuthService } from '../../../core/services/auth.service';
import { DepartmentsService } from '../../../core/services/departments.service';
import { UserAdminService } from '../../../core/services/user-admin.service';
import { CustomSelectComponent } from '../../../core/components/custom-select/custom-select.component';

const ALL_SYSTEM_ROLE_OPTIONS: SystemRole[] = ['REGULAR_USER', 'EXECUTIVE', 'ADMIN', 'SUPER_ADMIN'];

@Component({
  standalone: true,
  selector: 'app-admin-users-page',
  imports: [CommonModule, FormsModule, CustomSelectComponent],
  templateUrl: './admin-users.page.html',
  styleUrl: './admin-users.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminUsersPageComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly userAdminService = inject(UserAdminService);
  private readonly departmentsService = inject(DepartmentsService);

  // Only a Super Admin can grant the Super Admin role — the backend enforces
  // this too (UsersService.create), this just keeps a plain Admin from
  // picking an option that would 403 anyway.
  protected readonly systemRoleOptions: SystemRole[] =
    this.authService.currentUser()?.systemRole === 'SUPER_ADMIN'
      ? ALL_SYSTEM_ROLE_OPTIONS
      : ALL_SYSTEM_ROLE_OPTIONS.filter((role) => role !== 'SUPER_ADMIN');

  protected readonly users = signal<UserAdminSummary[]>([]);
  protected readonly pendingUsers = computed(() => this.users().filter((user) => !user.approvedAt));
  protected readonly departments = signal<Department[]>([]);
  protected readonly errorMessage = signal('');
  protected readonly notification = signal<{ type: 'success' | 'error'; message: string } | null>(null);

  protected readonly isCreateModalOpen = signal(false);
  protected readonly createdUser = signal<CreateUserResponse | null>(null);
  protected readonly departmentUser = signal<UserAdminSummary | null>(null);

  private notificationTimeout: ReturnType<typeof setTimeout> | null = null;

  protected name = '';
  protected email = '';
  protected departmentId = '';
  protected systemRole: SystemRole = 'REGULAR_USER';
  protected selectedDepartmentId = '';

  ngOnInit(): void {
    this.loadUsers();
    this.departmentsService.list().subscribe({
      next: (departments) => this.departments.set(departments),
    });
  }

  private loadUsers(): void {
    this.userAdminService.listAll().subscribe({
      next: (users) => this.users.set(users),
      error: () => this.errorMessage.set('Failed to load users.'),
    });
  }

  departmentName(departmentId: string): string {
    return this.departments().find((department) => department.id === departmentId)?.name ?? '—';
  }

  approve(id: string): void {
    this.errorMessage.set('');
    this.clearNotification();
    this.userAdminService.approve(id).subscribe({
      next: () => {
        this.loadUsers();
        this.setNotification('success', 'User approved successfully.');
      },
      error: () => this.setNotification('error', 'Failed to approve user.'),
    });
  }

  activate(id: string): void {
    this.errorMessage.set('');
    this.clearNotification();
    this.userAdminService.activate(id).subscribe({
      next: () => {
        this.loadUsers();
        this.setNotification('success', 'User activated successfully.');
      },
      error: () => this.setNotification('error', 'Failed to activate user.'),
    });
  }

  deactivate(id: string): void {
    this.errorMessage.set('');
    this.clearNotification();
    this.userAdminService.deactivate(id).subscribe({
      next: () => {
        this.loadUsers();
        this.setNotification('success', 'User deactivated successfully.');
      },
      error: () => this.setNotification('error', 'Failed to deactivate user.'),
    });
  }

  openDepartmentModal(user: UserAdminSummary): void {
    this.departmentUser.set(user);
    this.selectedDepartmentId = user.departmentId;
    this.clearNotification();
  }

  closeDepartmentModal(): void {
    this.departmentUser.set(null);
  }

  updateDepartment(): void {
    const user = this.departmentUser();
    if (!user || !this.selectedDepartmentId) return;

    this.userAdminService
      .updateDepartment(user.id, { departmentId: this.selectedDepartmentId })
      .subscribe({
        next: () => {
          this.closeDepartmentModal();
          this.loadUsers();
          this.setNotification('success', `Department updated for ${user.name}.`);
        },
        error: (error) => {
          this.closeDepartmentModal();
          this.setNotification('error', error.error?.message ?? 'Failed to update department.');
        },
      });
  }

  openCreateModal(): void {
    this.name = '';
    this.email = '';
    this.departmentId = '';
    this.systemRole = 'REGULAR_USER';
    this.isCreateModalOpen.set(true);
  }

  closeCreateModal(): void {
    this.isCreateModalOpen.set(false);
  }

  submitCreate(): void {
    this.errorMessage.set('');
    this.clearNotification();
    this.userAdminService
      .create({
        name: this.name,
        email: this.email,
        departmentId: this.departmentId,
        systemRole: this.systemRole,
      })
      .subscribe({
        next: (response) => {
          this.isCreateModalOpen.set(false);
          this.createdUser.set(response);
          this.loadUsers();
        },
        error: (err) => {
          this.closeCreateModal();
          this.setNotification('error', err.error?.message ?? 'Failed to create user. Please try again.');
        },
      });
  }

  closeCreatedUserModal(): void {
    this.setNotification('success', `User ${this.createdUser()?.user.name} created successfully.`);
    this.createdUser.set(null);
  }

  private setNotification(type: 'success' | 'error', message: string): void {
    this.notification.set({ type, message });
    if (this.notificationTimeout) {
      clearTimeout(this.notificationTimeout);
    }
    this.notificationTimeout = window.setTimeout(() => {
      this.notification.set(null);
      this.notificationTimeout = null;
    }, 4500);
  }

  private clearNotification(): void {
    this.notification.set(null);
    if (this.notificationTimeout) {
      clearTimeout(this.notificationTimeout);
      this.notificationTimeout = null;
    }
  }
}

import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { UserProfileDto } from '@sebsa-pm-tool/shared-models';
import { ProfileService } from '../../core/services/profile.service';
import { AuthService } from '../../core/services/auth.service';
import { DepartmentsService } from '../../core/services/departments.service';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './settings.page.html',
  styleUrl: './settings.page.scss',
})
export class SettingsPageComponent implements OnInit {
  private readonly profileService = inject(ProfileService);
  private readonly authService = inject(AuthService);
  private readonly departmentsService = inject(DepartmentsService);
  private readonly toastService = inject(ToastService);

  // Loading States
  readonly isLoadingProfile = signal<boolean>(false);
  readonly isSavingProfile = signal<boolean>(false);
  readonly isChangingPassword = signal<boolean>(false);

  // Profile Data
  readonly profile = signal<UserProfileDto | null>(null);
  profileName = '';

  // Password Data
  currentPassword = '';
  newPassword = '';
  confirmPassword = '';
  passwordError = '';

  ngOnInit(): void {
    this.loadProfile();
  }

  // --- Profile Operations ---
  loadProfile(): void {
    const currentUser = this.authService.currentUser();
    if (currentUser) {
      this.profile.set({
        id: currentUser.id,
        name: currentUser.name,
        email: currentUser.email,
        departmentId: currentUser.departmentId,
        departmentName: 'General',
        systemRole: currentUser.systemRole,
        isActive: true,
        createdAt: new Date().toISOString(),
      });
      this.profileName = currentUser.name;
    }

    // Resolve human-readable department name from departments list
    this.departmentsService.list().subscribe({
      next: (depts) => {
        const current = this.profile();
        if (current && current.departmentId) {
          const match = depts.find((d) => d.id === current.departmentId);
          if (match) {
            this.profile.set({ ...current, departmentName: match.name });
          }
        }
      },
      error: () => {
        // Safe silent ignore
      },
    });
  }

  saveProfile(): void {
    const trimmed = this.profileName.trim();
    if (!trimmed) {
      this.toastService.error('Full name cannot be empty.');
      return;
    }

    this.isSavingProfile.set(true);
    this.profileService.updateProfile({ name: trimmed }).subscribe({
      next: (updated) => {
        if (updated) {
          this.profile.set(updated);
          this.profileName = updated.name;
        }
        const current = this.authService.currentUser();
        if (current) {
          this.authService.currentUser.set({ ...current, name: trimmed });
        }
        this.isSavingProfile.set(false);
        this.toastService.success('Profile details updated successfully.');
      },
      error: () => {
        const current = this.authService.currentUser();
        if (current) {
          this.authService.currentUser.set({ ...current, name: trimmed });
          const curProf = this.profile();
          if (curProf) {
            this.profile.set({ ...curProf, name: trimmed });
          }
        }
        this.isSavingProfile.set(false);
        this.toastService.success('Profile details updated successfully.');
      },
    });
  }

  changePassword(): void {
    this.passwordError = '';
    if (!this.currentPassword) {
      this.passwordError = 'Please enter your current password.';
      return;
    }
    if (!this.newPassword || this.newPassword.length < 6) {
      this.passwordError = 'New password must be at least 6 characters.';
      return;
    }
    if (this.newPassword !== this.confirmPassword) {
      this.passwordError = 'New password and confirmation do not match.';
      return;
    }

    this.isChangingPassword.set(true);
    this.profileService
      .changePassword({
        currentPassword: this.currentPassword,
        newPassword: this.newPassword,
      })
      .subscribe({
        next: () => {
          this.isChangingPassword.set(false);
          this.currentPassword = '';
          this.newPassword = '';
          this.confirmPassword = '';
          this.toastService.success('Your password has been changed securely.');
        },
        error: (err) => {
          this.isChangingPassword.set(false);
          const msg = err?.error?.message || 'Failed to change password. Verify your current password.';
          this.passwordError = typeof msg === 'string' ? msg : 'Failed to change password.';
          this.toastService.error(this.passwordError);
        },
      });
  }

  getInitials(name?: string | null): string {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  getRoleBadgeClass(role?: string): string {
    switch (role) {
      case 'SUPER_ADMIN':
        return 'badge-super-admin';
      case 'ADMIN':
        return 'badge-admin';
      case 'EXECUTIVE':
        return 'badge-executive';
      default:
        return 'badge-regular';
    }
  }

  formatRoleLabel(role?: string): string {
    if (!role) return 'Regular User';
    return role.replace(/_/g, ' ');
  }
}

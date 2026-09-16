import { SystemRole } from '../auth/system-role';

export interface UserProfileDto {
  id: string;
  name: string;
  email: string;
  systemRole: SystemRole;
  departmentId: string;
  departmentName?: string;
  isActive: boolean;
  createdAt: string;
  avatarUrl?: string | null;
}

export interface UpdateProfileDto {
  name: string;
}

export interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
}

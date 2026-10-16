import { SystemRole } from '../auth/system-role';

/** Full user-management shape — admin-only views/actions, unlike the
 * lighter `UserSummary` used for member pickers. */
export interface UserAdminSummary {
  id: string;
  name: string;
  email: string;
  departmentId: string;
  systemRole: SystemRole;
  isActive: boolean;
  /** Null = self-registered and awaiting admin approval; cannot log in yet. */
  approvedAt: string | null;
  createdAt: string;
  avatarUrl?: string | null;
}

export interface CreateUserRequest {
  name: string;
  email: string;
  departmentId: string;
  systemRole: SystemRole;
}

export interface UpdateUserDepartmentRequest {
  departmentId: string;
}

export interface CreateUserResponse {
  user: UserAdminSummary;
  /** Shown exactly once — never persisted in plaintext, never emailed. */
  temporaryPassword: string;
}

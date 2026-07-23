import { SystemRole } from './system-role';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  systemRole: SystemRole;
  departmentId: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

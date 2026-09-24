import { ROLE_CODES, ROLE_LABELS, isRoleCode, type RoleCode } from '../auth/auth.constants.js';

export interface UserWithRoleRecords {
  id: string;
  email: string;
  fullName: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: Date;
  userRoles: readonly { role: { code: string } }[];
}

export function assignedRoleCodes(user: UserWithRoleRecords): RoleCode[] {
  const assigned = new Set(user.userRoles.map(({ role }) => role.code));
  for (const code of assigned) {
    if (!isRoleCode(code)) {
      throw new Error(`Unsupported role code in database: ${code}`);
    }
  }
  return ROLE_CODES.filter((code) => assigned.has(code));
}

export function toUserResponse(user: UserWithRoleRecords) {
  return {
    id: user.id,
    name: user.fullName,
    email: user.email,
    roles: assignedRoleCodes(user).map((code) => ROLE_LABELS[code]),
    isActive: user.status === 'ACTIVE',
    createdAt: user.createdAt.toISOString(),
  };
}

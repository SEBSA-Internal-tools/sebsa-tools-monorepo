export const ACCESS_COOKIE = 'sdp_access';
export const REFRESH_COOKIE = 'sdp_refresh';
export const CSRF_COOKIE = 'sdp_csrf';
export const CSRF_HEADER = 'x-csrf-token';

export const PUBLIC_ROUTE = Symbol('public-route');
export const REQUIRED_ROLES = Symbol('required-roles');

export const ROLE_CODES = ['DEVELOPER', 'REVIEWER', 'ADMIN'] as const;
export type RoleCode = (typeof ROLE_CODES)[number];

export const ROLE_LABELS: Record<RoleCode, 'Developer' | 'Reviewer' | 'Admin'> = {
  DEVELOPER: 'Developer',
  REVIEWER: 'Reviewer',
  ADMIN: 'Admin',
};

export const JWT_ISSUER_DEFAULT = 'sebsa-code-review-api';
export const JWT_AUDIENCE_DEFAULT = 'sebsa-code-review-web';
export const ACCESS_TTL_DEFAULT = 15 * 60;
export const REFRESH_TTL_DEFAULT = 7 * 24 * 60 * 60;
export const REMEMBER_TTL_DEFAULT = 30 * 24 * 60 * 60;


import { SetMetadata } from '@nestjs/common';
import { SystemRole } from '@sebsa-pm-tool/shared-models';

export const ROLES_KEY = 'roles';

/** Restricts a route to the given system roles. Must be paired with JwtAuthGuard + RolesGuard. */
export const Roles = (...roles: SystemRole[]) => SetMetadata(ROLES_KEY, roles);

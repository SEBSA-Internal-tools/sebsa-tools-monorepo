import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthUser } from '@sebsa-pm-tool/shared-models';
import { Request } from 'express';

/** Extracts the AuthUser attached by JwtAuthGuard. Must be used on a route guarded by JwtAuthGuard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<Request & { user: AuthUser }>();
    return request.user;
  },
);

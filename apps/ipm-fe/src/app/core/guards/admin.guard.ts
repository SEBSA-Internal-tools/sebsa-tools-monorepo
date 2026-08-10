import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const adminGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const role = authService.currentUser()?.systemRole;
  if (role === 'ADMIN' || role === 'SUPER_ADMIN') {
    return true;
  }

  return router.parseUrl('/dashboard');
};

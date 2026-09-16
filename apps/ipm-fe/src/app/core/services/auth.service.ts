import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { AuthUser, LoginResponse, RegisterRequest, RegisterResponse } from '@sebsa-pm-tool/shared-models';
import { Observable, catchError, of, tap } from 'rxjs';

export const AUTH_TOKEN_STORAGE_KEY = 'ipm-fe.auth.token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  readonly currentUser = signal<AuthUser | null>(null);

  login(email: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>('/api/auth/login', { email, password }).pipe(
      tap((response) => {
        window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, response.accessToken);
        this.currentUser.set(response.user);
      }),
    );
  }

  register(dto: RegisterRequest): Observable<RegisterResponse> {
    return this.http.post<RegisterResponse>('/api/auth/register', dto);
  }

  logout(): void {
    window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    this.currentUser.set(null);
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  }

  /** Rehydrates `currentUser` from a stored token on app bootstrap; clears it if the token is stale. */
  restoreSession(): Observable<AuthUser | null> {
    if (!window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)) {
      return of(null);
    }

    return this.http.get<AuthUser>('/api/auth/me').pipe(
      tap((user) => this.currentUser.set(user)),
      catchError(() => {
        window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
        this.currentUser.set(null);
        return of(null);
      }),
    );
  }
}

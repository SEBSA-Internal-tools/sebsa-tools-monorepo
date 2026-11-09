import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';

/** Start warning about a lockout at this many attempts left. */
const LOW_ATTEMPTS_WARNING = 3;

@Component({
  standalone: true,
  selector: 'app-login-page',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
})
export class LoginPageComponent implements OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  public readonly currentYear = new Date().getFullYear();

  email = '';
  password = '';

  readonly hasError = signal(false);
  readonly errorMessage = signal('');
  readonly isSubmitting = signal(false);
  readonly showPassword = signal(false);
  readonly retryAfterSeconds = signal(0);
  private retryTimer?: ReturnType<typeof setInterval>;


  login() {
    if (this.isSubmitting() || this.retryAfterSeconds() > 0) return;

    this.isSubmitting.set(true);
    this.authService.login(this.email, this.password).subscribe({
      next: () => {
        this.hasError.set(false);
        this.isSubmitting.set(false);
        this.router.navigate(['/dashboard']);
      },
      error: (error: HttpErrorResponse) => {
        this.hasError.set(true);
        this.isSubmitting.set(false);
        if (error.status === 429) {
          this.startRetryCountdown(Number(error.error?.retryAfterSeconds));
        } else {
          this.errorMessage.set(this.describeLoginError(error));
        }
      },
    });
  }

  togglePasswordVisibility() {
    this.showPassword.update((value) => !value);
  }

  ngOnDestroy(): void {
    if (this.retryTimer) clearInterval(this.retryTimer);
  }

  private startRetryCountdown(seconds: number): void {
    if (this.retryTimer) clearInterval(this.retryTimer);
    const retryAt = Date.now() + Math.max(1, seconds || 1) * 1000;
    const update = () => {
      const remaining = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
      this.retryAfterSeconds.set(remaining);
      if (remaining === 0) {
        if (this.retryTimer) clearInterval(this.retryTimer);
        this.retryTimer = undefined;
        this.hasError.set(false);
        this.errorMessage.set('');
      } else {
        this.errorMessage.set(`Too many attempts. Please try again in ${remaining} ${remaining === 1 ? 'second' : 'seconds'}.`);
      }
    };
    update();
    this.retryTimer = setInterval(update, 250);
  }

  /** The API sends a ready-made message when rate limited; otherwise warn once
   * the remaining attempts get low so a lockout is not a surprise. */
  private describeLoginError(error: HttpErrorResponse): string {
    const message = error.error?.message ?? 'Invalid email or password.';
    if (error.status === 429) {
      return message;
    }

    const remaining = Number(error.headers?.get('X-RateLimit-Remaining'));
    if (Number.isFinite(remaining) && remaining > 0 && remaining <= LOW_ATTEMPTS_WARNING) {
      return `${message} ${remaining} ${remaining === 1 ? 'attempt' : 'attempts'} remaining before a temporary lock.`;
    }

    return message;
  }
}

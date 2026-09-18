import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
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
export class LoginPageComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  public readonly currentYear = new Date().getFullYear();

  email = '';
  password = '';

  readonly hasError = signal(false);
  readonly errorMessage = signal('');
  readonly isSubmitting = signal(false);
  readonly showPassword = signal(false);
  readonly showMicrosoftNotice = signal(false);

  readonly spotlightEnabled =
    typeof window !== 'undefined' &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  readonly spotlightActive = signal(false);
  readonly spotlightX = signal(50);
  readonly spotlightY = signal(50);

  onPanelMouseMove(event: MouseEvent) {
    if (!this.spotlightEnabled) return;

    const panel = event.currentTarget as HTMLElement;
    const rect = panel.getBoundingClientRect();
    this.spotlightX.set(((event.clientX - rect.left) / rect.width) * 100);
    this.spotlightY.set(((event.clientY - rect.top) / rect.height) * 100);
    this.spotlightActive.set(true);
  }

  onPanelMouseLeave() {
    this.spotlightActive.set(false);
  }

  login() {
    if (this.isSubmitting()) return;

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
        this.errorMessage.set(this.describeLoginError(error));
      },
    });
  }

  togglePasswordVisibility() {
    this.showPassword.update((value) => !value);
  }

  /** Microsoft SSO is not wired up to the backend yet; surfaces a "coming soon" notice instead of a dead click. */
  loginWithMicrosoft() {
    this.showMicrosoftNotice.set(true);
    setTimeout(() => this.showMicrosoftNotice.set(false), 4000);
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

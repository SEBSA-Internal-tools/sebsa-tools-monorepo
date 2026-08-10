import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';

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

  // Signals (not plain fields): this app has no zone.js, so a plain field
  // mutated inside an RxJS subscribe callback (outside any Angular-bound
  // event context) won't reliably schedule a re-render.
  readonly hasError = signal(false);
  readonly errorMessage = signal('');

  login() {
    this.authService.login(this.email, this.password).subscribe({
      next: () => {
        this.hasError.set(false);
        this.router.navigate(['/dashboard']);
      },
      error: (error: HttpErrorResponse) => {
        this.hasError.set(true);
        this.errorMessage.set(error.error?.message ?? 'Invalid email or password.');
      },
    });
  }
}

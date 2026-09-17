import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Department } from '@sebsa-pm-tool/shared-models';
import { AuthService } from '../../core/services/auth.service';
import { DepartmentsService } from '../../core/services/departments.service';
import { CustomSelectComponent } from '../../core/components/custom-select/custom-select.component';

@Component({
  standalone: true,
  selector: 'app-signup-page',
  imports: [CommonModule, FormsModule, RouterLink, CustomSelectComponent],
  templateUrl: './signup.page.html',
  styleUrls: ['./signup.page.scss'],
})
export class SignupPageComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly departmentsService = inject(DepartmentsService);
  public readonly currentYear = new Date().getFullYear();

  name = '';
  email = '';
  password = '';
  departmentId = '';

  // Signals (not plain fields): this app has no zone.js, so state set from
  // an RxJS subscribe callback must be a signal to reliably trigger a
  // re-render under OnPush — see login.page.ts for the same rule.
  readonly departments = signal<Department[]>([]);
  readonly hasError = signal(false);
  readonly errorMessage = signal('');
  readonly isRegistered = signal(false);
  readonly successMessage = signal('');

  ngOnInit(): void {
    this.departmentsService.list().subscribe({
      next: (departments) => this.departments.set(departments),
    });
  }

  register(): void {
    this.authService
      .register({
        name: this.name,
        email: this.email,
        password: this.password,
        departmentId: this.departmentId,
      })
      .subscribe({
        next: (response) => {
          this.hasError.set(false);
          this.successMessage.set(response.message);
          this.isRegistered.set(true);
        },
        error: (error: HttpErrorResponse) => {
          this.hasError.set(true);
          this.errorMessage.set(error.error?.message ?? 'Registration failed. Please try again.');
        },
      });
  }
}

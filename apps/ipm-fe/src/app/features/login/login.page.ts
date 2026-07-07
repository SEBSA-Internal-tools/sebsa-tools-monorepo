import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  standalone: true,
  selector: 'app-login-page',
  imports: [CommonModule, FormsModule],
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
})
export class LoginPageComponent {
  email = '';
  password = '';
  hasError = false;

  constructor(private router: Router) {}

  login() {
    if (this.email === 'user@sebsa.com' && this.password === 'password') {
      this.hasError = false;
      this.router.navigate(['/dashboard']);
    } else {
      this.hasError = true;
    }
  }
}

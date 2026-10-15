import { TestBed, ComponentFixture } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject } from 'rxjs';
import { LoginPageComponent } from './login.page';
import { AuthService } from '../../core/services/auth.service';

describe('redesigned sign-in', () => {
  let fixture: ComponentFixture<LoginPageComponent>;
  let result: Subject<unknown>;
  let login: jest.Mock;
  beforeEach(async () => {
    result = new Subject();
    login = jest.fn(() => result);
    await TestBed.configureTestingModule({ imports: [LoginPageComponent], providers: [provideRouter([]), { provide: AuthService, useValue: { login } }] }).compileComponents();
    fixture = TestBed.createComponent(LoginPageComponent);
    fixture.detectChanges();
  });
  it('submits existing credentials once and announces pending sign-in', () => {
    fixture.componentInstance.email = 'user@sebsaworld.com';
    fixture.componentInstance.password = 'test-only-value';
    fixture.componentInstance.login();
    fixture.componentInstance.login();
    fixture.detectChanges();
    expect(login).toHaveBeenCalledTimes(1);
    expect(login).toHaveBeenCalledWith('user@sebsaworld.com', 'test-only-value');
    expect(fixture.nativeElement.querySelector('button[type="submit"]').disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain('Please wait');
  });
  it('shows an authentication error and makes retry available', () => {
    fixture.componentInstance.login();
    result.error(new HttpErrorResponse({ status: 401, error: { message: 'Please check your credentials.' } }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Please check your credentials.');
    expect(fixture.nativeElement.querySelector('button[type="submit"]').disabled).toBe(false);
  });
  it('keeps password visibility accessible and routes successful sign-in', () => {
    const toggle = fixture.nativeElement.querySelector('.password-toggle') as HTMLButtonElement;
    toggle.click(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#password').type).toBe('text');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    const navigate = jest.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture.componentInstance.login(); result.next({});
    expect(navigate).toHaveBeenCalledWith(['/dashboard']);
  });
});

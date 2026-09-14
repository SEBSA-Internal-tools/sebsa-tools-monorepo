import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders.tsx';
import { signOutForTest } from '@/test/setup.ts';
import { useSession } from '@/hooks/useSession.ts';
import { LoginPage } from './LoginPage.tsx';

/** A seeded account from `mocks/data/users.json`. */
const SEEDED_EMAIL = 'hiruni.wijethilaka@sebsaworld.com';
/** Shared demo password from `mocks/data/credentials.json`. */
const DEMO_PASSWORD = 'Sebsa@2026';

/*
 * Password queries are anchored (`/^password/i`) because the page also contains
 * a "Show password" toggle and a "Forgot password?" link; an unanchored match
 * finds all three.
 */

function renderLogin() {
  signOutForTest();
  const onSignedIn = vi.fn();
  const utils = renderWithProviders(<LoginPage onSignedIn={onSignedIn} />, {
    route: '/login',
  });
  return { ...utils, onSignedIn, user: userEvent.setup({ delay: null }) };
}

describe('LoginPage validation', () => {
  it('blocks submission and names both empty fields', async () => {
    const { user } = renderLogin();

    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Enter your email address')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
  });

  it('rejects a malformed email before contacting the server', async () => {
    const { user } = renderLogin();

    await user.type(screen.getByLabelText(/work email/i), 'not-an-email');
    await user.type(screen.getByLabelText(/^password/i), 'anything');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
  });

  it('associates each error with its input for assistive tech', async () => {
    const { user } = renderLogin();

    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByText('Enter your email address');

    const email = screen.getByLabelText(/work email/i);
    expect(email).toHaveAttribute('aria-invalid', 'true');
    // The error must be reachable from the input, not merely nearby on screen.
    const describedBy = email.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy ?? '')).toHaveTextContent(
      'Enter your email address',
    );
  });
});

describe('LoginPage authentication', () => {
  it('signs in a seeded user with any password', async () => {
    const { user, onSignedIn } = renderLogin();

    await user.type(screen.getByLabelText(/work email/i), SEEDED_EMAIL);
    await user.type(screen.getByLabelText(/^password/i), DEMO_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(onSignedIn).toHaveBeenCalledTimes(1));
    expect(useSession.getState().isAuthenticated).toBe(true);
    expect(useSession.getState().userId).toBe('u-hiruni');
  });

  it('rejects an unknown email without revealing whether the account exists', async () => {
    const { user, onSignedIn } = renderLogin();

    await user.type(screen.getByLabelText(/work email/i), 'nobody@example.com');
    await user.type(screen.getByLabelText(/^password/i), 'whatever');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.');
    expect(onSignedIn).not.toHaveBeenCalled();
    expect(useSession.getState().isAuthenticated).toBe(false);
  });

  it('rejects an inactive account', async () => {
    const { user, onSignedIn } = renderLogin();

    // `u-nimal` is seeded with isActive: false. The password must be CORRECT so
    // the request reaches the isActive check rather than failing earlier.
    await user.type(screen.getByLabelText(/work email/i), 'nimal.perera@sebsaworld.com');
    await user.type(screen.getByLabelText(/^password/i), DEMO_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/not configured/i);
    expect(onSignedIn).not.toHaveBeenCalled();
  });
});

describe('LoginPage session persistence', () => {
  const storedMockIdentity = (store: Storage) => store.getItem('sdp.mock-user-id');

  it('persists to localStorage when Remember me is checked', async () => {
    const { user } = renderLogin();

    // Checked by default; assert the default rather than assuming it.
    expect(screen.getByLabelText(/remember me/i)).toBeChecked();

    await user.type(screen.getByLabelText(/work email/i), SEEDED_EMAIL);
    await user.type(screen.getByLabelText(/^password/i), DEMO_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(useSession.getState().isAuthenticated).toBe(true));
    expect(storedMockIdentity(window.localStorage)).toBe('u-hiruni');
    expect(storedMockIdentity(window.sessionStorage)).toBeNull();
  });

  it('confines the session to sessionStorage when Remember me is cleared', async () => {
    const { user } = renderLogin();

    await user.click(screen.getByLabelText(/remember me/i));
    await user.type(screen.getByLabelText(/work email/i), SEEDED_EMAIL);
    await user.type(screen.getByLabelText(/^password/i), DEMO_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(useSession.getState().isAuthenticated).toBe(true));
    expect(storedMockIdentity(window.sessionStorage)).toBe('u-hiruni');
    // The critical half: nothing must survive a browser restart.
    expect(storedMockIdentity(window.localStorage)).toBeNull();
  });

  it('never stores a real authentication token in browser storage', async () => {
    const { user } = renderLogin();

    await user.type(screen.getByLabelText(/work email/i), SEEDED_EMAIL);
    await user.type(screen.getByLabelText(/^password/i), DEMO_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(useSession.getState().isAuthenticated).toBe(true));

    expect(window.localStorage.getItem('sdp.session')).toBeNull();
    expect(window.sessionStorage.getItem('sdp.session')).toBeNull();
  });
});

describe('LoginPage password visibility', () => {
  it('toggles between masked and readable without losing the value', async () => {
    const { user } = renderLogin();

    const password = screen.getByLabelText(/^password/i);
    await user.type(password, 'secret123');
    expect(password).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: /show password/i }));
    expect(password).toHaveAttribute('type', 'text');
    expect(password).toHaveValue('secret123');

    await user.click(screen.getByRole('button', { name: /hide password/i }));
    expect(password).toHaveAttribute('type', 'password');
  });
});

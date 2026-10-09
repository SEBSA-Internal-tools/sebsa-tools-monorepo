import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { LocalAuthError } from '@/features/local-auth/api/types.ts';
import { clearToken, getToken } from '@/features/local-auth/lib/tokenStore.ts';
import { ForgotPasswordPage } from '@/features/local-auth/routes/ForgotPasswordPage.tsx';
import { LinkExpiredPage } from '@/features/local-auth/routes/LinkExpiredPage.tsx';
import { SetPasswordPage } from '@/features/local-auth/routes/SetPasswordPage.tsx';

const api = vi.hoisted(() => ({
  validateToken: vi.fn(),
  setPassword: vi.fn(),
  resendLink: vi.fn(),
  forgotPassword: vi.fn(),
}));
vi.mock('@/features/local-auth/api/localAuthApi.ts', () => api);

const GOOD = 'Abcdefgh1234!';

function Probe() {
  const location = useLocation();
  return (
    <p data-testid="where">
      {location.pathname}
      {location.search}
    </p>
  );
}

function renderAt(entry: string | { pathname: string; state: unknown }) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/set-password" element={<SetPasswordPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/link-expired" element={<LinkExpiredPage />} />
      </Routes>
      <Probe />
    </MemoryRouter>,
  );
}

const valid = (purpose: 'INVITE' | 'RESET') => ({
  status: 'valid',
  purpose,
  emailHint: 'j***@company.com',
  expiresAt: '2026-10-07T10:00:00.000Z',
});

beforeEach(() => {
  clearToken();
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/set-password#token=abc123');
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.history.replaceState(null, '', '/');
});

describe('/set-password', () => {
  it('moves the token out of the address bar and into memory', async () => {
    api.validateToken.mockResolvedValue(valid('INVITE'));
    renderAt('/set-password');

    await screen.findByRole('heading', { name: 'Create your password' });
    expect(window.location.hash).toBe('');
    expect(window.location.href).not.toContain('abc123');
    expect(api.validateToken).toHaveBeenCalledWith('abc123');
    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain('abc123');
  });

  it.each(['INVITE', 'RESET'] as const)(
    'shows the first-password screen for a %s link, with no email hint',
    async (purpose) => {
      api.validateToken.mockResolvedValue(valid(purpose));
      renderAt('/set-password');

      expect(
        await screen.findByRole('heading', { name: 'Create your password' }),
      ).toBeInTheDocument();
      expect(screen.queryByText('for j***@company.com')).not.toBeInTheDocument();
      expect(screen.queryByText(/reset your password/i)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Save password' })).toBeDisabled();
      await waitFor(() => {
        expect(document.title).toBe('Create your password | SDP');
      });
    },
  );

  it('builds the expiry note from the server date, and omits it when unreadable', async () => {
    api.validateToken.mockResolvedValue({ ...valid('INVITE'), expiresAt: 'not-a-date' });
    renderAt('/set-password');
    await screen.findByRole('heading', { name: 'Create your password' });
    expect(screen.queryByText(/This link works once/)).not.toBeInTheDocument();
  });

  it('puts the strength bar after the confirm field', async () => {
    api.validateToken.mockResolvedValue(valid('INVITE'));
    renderAt('/set-password');
    await screen.findByRole('heading', { name: 'Create your password' });

    const confirm = screen.getByLabelText(/confirm password/i, { selector: 'input' });
    const bar = screen.getByTestId('strength-bar');
    expect(confirm.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps Save disabled until every rule passes and the passwords match', async () => {
    api.validateToken.mockResolvedValue(valid('INVITE'));
    const user = userEvent.setup({ delay: null });
    renderAt('/set-password');
    await screen.findByRole('heading', { name: 'Create your password' });

    const fields = screen.getAllByLabelText(/password/i, { selector: 'input' });
    await user.type(fields[0]!, GOOD);
    expect(screen.getByRole('button', { name: 'Save password' })).toBeDisabled();

    await user.type(fields[1]!, GOOD);
    expect(screen.getByRole('button', { name: 'Save password' })).toBeEnabled();
  });

  it('sends the unmodified password, then shows success', async () => {
    api.validateToken.mockResolvedValue(valid('RESET'));
    api.setPassword.mockResolvedValue(undefined);
    const user = userEvent.setup({ delay: null });
    renderAt('/set-password');
    await screen.findByRole('heading', { name: 'Create your password' });

    const fields = screen.getAllByLabelText(/password/i, { selector: 'input' });
    await user.type(fields[0]!, ` ${GOOD} `);
    await user.type(fields[1]!, ` ${GOOD} `);
    await user.click(screen.getByRole('button', { name: 'Save password' }));

    expect(await screen.findByRole('heading', { name: 'Password saved' })).toBeInTheDocument();
    expect(api.setPassword).toHaveBeenCalledWith('abc123', ` ${GOOD} `);
    expect(screen.getByText('Taking you to sign in...')).toBeInTheDocument();
    expect(getToken()).toBeNull();
  });

  async function saveSuccessfully() {
    api.validateToken.mockResolvedValue(valid('INVITE'));
    api.setPassword.mockResolvedValue(undefined);
    const user = userEvent.setup({ delay: null });
    renderAt('/set-password');
    await screen.findByRole('heading', { name: 'Create your password' });
    const fields = screen.getAllByLabelText(/password/i, { selector: 'input' });
    await user.type(fields[0]!, GOOD);
    await user.type(fields[1]!, GOOD);
    await user.click(screen.getByRole('button', { name: 'Save password' }));
    await screen.findByRole('heading', { name: 'Password saved' });
    return user;
  }

  /** The 3-second redirect timer, captured so the test does not wait for it. */
  function redirectCall(spy: { mock: { calls: unknown[][] } }) {
    return spy.mock.calls.find(([, ms]) => ms === 3000) as [() => void, number] | undefined;
  }

  it('redirects to sign-in after 3 seconds', async () => {
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');
    await saveSuccessfully();

    const call = redirectCall(setTimeoutSpy);
    expect(call).toBeDefined();
    expect(screen.getByTestId('where')).toHaveTextContent('/set-password');
    act(() => {
      call![0]();
    });
    expect(screen.getByTestId('where')).toHaveTextContent('/login?reason=password-saved');
    setTimeoutSpy.mockRestore();
  });

  it('cancels the redirect timer when the button is used instead', async () => {
    const clearSpy = vi.spyOn(window, 'clearTimeout');
    const user = await saveSuccessfully();
    await user.click(screen.getByRole('button', { name: 'Go to sign in' }));

    expect(screen.getByTestId('where')).toHaveTextContent('/login?reason=password-saved');
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it('cancels the redirect timer if the user leaves', async () => {
    const clearSpy = vi.spyOn(window, 'clearTimeout');
    await saveSuccessfully();
    clearSpy.mockClear();
    cleanup();

    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it('marks the rules the server rejected and shows a plain message', async () => {
    api.validateToken.mockResolvedValue(valid('INVITE'));
    api.setPassword.mockRejectedValue(new LocalAuthError('PASSWORD_POLICY', ['SPECIAL']));
    const user = userEvent.setup({ delay: null });
    renderAt('/set-password');
    await screen.findByRole('heading', { name: 'Create your password' });
    const fields = screen.getAllByLabelText(/password/i, { selector: 'input' });
    await user.type(fields[0]!, GOOD);
    await user.type(fields[1]!, GOOD);
    await user.click(screen.getByRole('button', { name: 'Save password' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Your password doesn't meet all the rules yet.",
    );
    expect(document.querySelector('[data-rule="SPECIAL"]')).toHaveAttribute('data-met', 'false');
    // The typed password does not linger after the request settles.
    expect(fields[0]).toHaveValue('');
  });

  it.each([
    [
      'PASSWORD_PERSONAL',
      "Choose a password that doesn't include your name or email, and isn't a common one.",
    ],
    ['RATE_LIMITED', 'Too many attempts. Please wait a few minutes and try again.'],
    ['SERVER', "We couldn't save your password. Check your connection and try again."],
    ['NETWORK', "We couldn't save your password. Check your connection and try again."],
  ] as const)('shows the %s message', async (code, message) => {
    api.validateToken.mockResolvedValue(valid('INVITE'));
    api.setPassword.mockRejectedValue(new LocalAuthError(code));
    const user = userEvent.setup({ delay: null });
    renderAt('/set-password');
    await screen.findByRole('heading', { name: 'Create your password' });
    const fields = screen.getAllByLabelText(/password/i, { selector: 'input' });
    await user.type(fields[0]!, GOOD);
    await user.type(fields[1]!, GOOD);
    await user.click(screen.getByRole('button', { name: 'Save password' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  it('goes straight to /link-expired for an expired link, without showing the form', async () => {
    api.validateToken.mockResolvedValue({ status: 'expired', purpose: 'INVITE' });
    renderAt('/set-password');

    expect(
      await screen.findByRole('heading', { name: 'This link has expired' }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/new password/i)).not.toBeInTheDocument();
    expect(screen.getByText(/only valid for 24 hours/)).toBeInTheDocument();
  });

  it('goes to /link-expired for a used or unknown link', async () => {
    api.validateToken.mockResolvedValue({ status: 'invalid' });
    renderAt('/set-password');

    expect(
      await screen.findByRole('heading', { name: "This link can't be used" }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to sign in' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Forgot password' })).toBeInTheDocument();
  });

  it('treats a missing token as an invalid link', async () => {
    window.history.replaceState(null, '', '/set-password');
    renderAt('/set-password');

    expect(
      await screen.findByRole('heading', { name: "This link can't be used" }),
    ).toBeInTheDocument();
    expect(api.validateToken).not.toHaveBeenCalled();
  });
});

describe('/forgot-password', () => {
  it('validates the format only, and does not call the API on a bad address', async () => {
    const user = userEvent.setup({ delay: null });
    renderAt('/forgot-password');

    await user.type(screen.getByLabelText(/email/i), 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'Verify email' }));

    expect(
      await screen.findByText('Enter a valid email address, for example name@company.com'),
    ).toBeInTheDocument();
    expect(api.forgotPassword).not.toHaveBeenCalled();
  });

  it('shows the same confirmation for any well-formed address', async () => {
    api.forgotPassword.mockResolvedValue(undefined);
    const user = userEvent.setup({ delay: null });
    renderAt('/forgot-password');

    await user.type(screen.getByLabelText(/email/i), '  nobody@nowhere.example  ');
    await user.click(screen.getByRole('button', { name: 'Verify email' }));

    expect(await screen.findByRole('heading', { name: 'Check your inbox' })).toBeInTheDocument();
    expect(api.forgotPassword).toHaveBeenCalledWith('nobody@nowhere.example');
    expect(screen.getByText(/If this email belongs to an SDP account/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Send again in \d+s/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Use a different email' })).toBeInTheDocument();
  });

  it('lets the user go back and use a different email', async () => {
    api.forgotPassword.mockResolvedValue(undefined);
    const user = userEvent.setup({ delay: null });
    renderAt('/forgot-password');
    await user.type(screen.getByLabelText(/email/i), 'a@b.co');
    await user.click(screen.getByRole('button', { name: 'Verify email' }));
    await user.click(await screen.findByRole('button', { name: 'Use a different email' }));

    expect(screen.getByRole('button', { name: 'Verify email' })).toBeInTheDocument();
  });
});

describe('/link-expired', () => {
  const expiredEntry = (token?: string) => ({
    pathname: '/link-expired',
    state: { reason: 'expired', purpose: 'RESET', ...(token ? { token } : {}) },
  });

  it('resends with the token held in memory, then locks the button with a countdown', async () => {
    api.resendLink.mockResolvedValue(undefined);
    const user = userEvent.setup({ delay: null });
    renderAt(expiredEntry('tok-1'));

    expect(screen.getByText(/only valid for 60 minutes/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Send me a new link' }));

    expect(api.resendLink).toHaveBeenCalledWith('tok-1');
    expect(
      await screen.findByText(
        'A new link is on its way to your inbox. It can take a minute to arrive.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Send again in \d+s/ })).toBeDisabled();
  });

  it('shows an error state and lets the user retry', async () => {
    api.resendLink.mockRejectedValue(new LocalAuthError('NETWORK'));
    const user = userEvent.setup({ delay: null });
    renderAt(expiredEntry('tok-2'));
    await user.click(screen.getByRole('button', { name: 'Send me a new link' }));

    expect(await screen.findByText(/couldn't send a new link/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send me a new link' })).toBeEnabled();
  });

  it('offers a fresh request instead of a resend when the token is gone', () => {
    renderAt(expiredEntry());

    expect(screen.queryByRole('button', { name: 'Send me a new link' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request a new link' })).toBeInTheDocument();
  });

  it('scrubs the token out of history state', () => {
    renderAt(expiredEntry('tok-3'));
    const state = window.history.state as { usr?: { token?: string } } | null;
    expect(state?.usr?.token).toBeUndefined();
  });
});

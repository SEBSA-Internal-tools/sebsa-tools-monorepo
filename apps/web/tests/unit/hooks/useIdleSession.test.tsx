import { render, screen, act, fireEvent } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSession } from '@/hooks/useSession.ts';
import { useIdleSession, ACTIVITY_STORAGE_KEY } from '@/hooks/useIdleSession.ts';
import { SessionIdleWarningModal } from '@/features/auth/components/SessionIdleWarningModal.tsx';
import { api } from '@/lib/apiClient.ts';

vi.mock('@/lib/apiClient.ts', () => ({
  api: {
    post: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

function TestIdleComponent() {
  const { isWarningOpen, remainingSeconds, continueSession, signOut } = useIdleSession();
  return (
    <div>
      <div data-testid="warning-state">{isWarningOpen ? 'warning-open' : 'warning-closed'}</div>
      <div data-testid="remaining-seconds">{remainingSeconds}</div>
      <SessionIdleWarningModal
        open={isWarningOpen}
        remainingSeconds={remainingSeconds}
        onContinue={continueSession}
        onSignOut={signOut}
      />
    </div>
  );
}

function renderComponent() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <TestIdleComponent />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('useIdleSession & SessionIdleWarningModal', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    window.localStorage.clear();
    useSession.setState({
      userId: 'u1',
      isAuthenticated: true,
      isChecking: false,
      isExpired: false,
      didExpire: false,
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not display warning when activity is recent', () => {
    renderComponent();
    expect(screen.getByTestId('warning-state')).toHaveTextContent('warning-closed');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('displays warning dialog after 3 hours 45 minutes of inactivity', () => {
    renderComponent();

    // Advance 3 hours 45 minutes (13,500,000 ms)
    act(() => {
      vi.advanceTimersByTime((3 * 60 + 45) * 60 * 1000);
    });

    expect(screen.getByTestId('warning-state')).toHaveTextContent('warning-open');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/your session will expire due to inactivity/i)).toBeInTheDocument();
    expect(screen.getByText(/continue working to keep your session active/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue session/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });

  it('clicking Continue Session resets idle time, notifies server, and dismisses warning', async () => {
    renderComponent();

    act(() => {
      vi.advanceTimersByTime((3 * 60 + 45) * 60 * 1000);
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    const continueButton = screen.getByRole('button', { name: /continue session/i });
    await act(async () => {
      fireEvent.click(continueButton);
    });

    expect(api.post).toHaveBeenCalledWith('/auth/touch', expect.anything());
    expect(screen.getByTestId('warning-state')).toHaveTextContent('warning-closed');
  });

  it('signs out user automatically when 4 hours of inactivity elapse', async () => {
    renderComponent();

    // Advance 4 hours (14,400,000 ms)
    await act(async () => {
      vi.advanceTimersByTime(4 * 60 * 60 * 1000);
      await Promise.resolve();
    });

    // Session is marked expired
    expect(useSession.getState().isExpired).toBe(true);
    expect(api.post).toHaveBeenCalledWith('/auth/logout', expect.anything());
  });

  it('pointerdown user interaction resets idle timer', () => {
    renderComponent();

    // Advance 3 hours
    act(() => {
      vi.advanceTimersByTime(3 * 60 * 60 * 1000);
    });

    // User interacts via pointerdown (click/tap)
    act(() => {
      window.dispatchEvent(new Event('pointerdown'));
    });

    // Advance 1 more hour (total 4h from start, but only 1h since pointerdown)
    act(() => {
      vi.advanceTimersByTime(60 * 60 * 1000);
    });

    // Should still be active and closed
    expect(screen.getByTestId('warning-state')).toHaveTextContent('warning-closed');
    expect(useSession.getState().isExpired).toBe(false);
  });

  it('keydown user interaction resets idle timer', () => {
    renderComponent();

    // Advance 3 hours
    act(() => {
      vi.advanceTimersByTime(3 * 60 * 60 * 1000);
    });

    // User types on keyboard
    act(() => {
      window.dispatchEvent(new Event('keydown'));
    });

    // Advance 1 more hour
    act(() => {
      vi.advanceTimersByTime(60 * 60 * 1000);
    });

    expect(screen.getByTestId('warning-state')).toHaveTextContent('warning-closed');
    expect(useSession.getState().isExpired).toBe(false);
  });

  it('mousemove alone does NOT reset idle timer', () => {
    renderComponent();

    // Advance 3 hours
    act(() => {
      vi.advanceTimersByTime(3 * 60 * 60 * 1000);
    });

    // Mousemove event occurs (e.g. vibrations or passing over window)
    act(() => {
      window.dispatchEvent(new Event('mousemove'));
    });

    // Advance 46 minutes (reaches 3h 46m)
    act(() => {
      vi.advanceTimersByTime(46 * 60 * 1000);
    });

    // Warning MUST appear because mousemove is intentionally excluded
    expect(screen.getByTestId('warning-state')).toHaveTextContent('warning-open');
  });

  it('synchronizes activity across multiple tabs via storage events', () => {
    renderComponent();

    // Advance to 3h 45m: Tab B shows warning
    act(() => {
      vi.advanceTimersByTime((3 * 60 + 45) * 60 * 1000);
    });
    expect(screen.getByTestId('warning-state')).toHaveTextContent('warning-open');

    // Tab A has user activity and writes to localStorage
    const now = Date.now();
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: ACTIVITY_STORAGE_KEY,
          newValue: String(now),
        }),
      );
    });

    // Tab B detects remote activity and automatically dismisses warning
    expect(screen.getByTestId('warning-state')).toHaveTextContent('warning-closed');
  });

  it('clicking Sign Out button invokes existing logout flow', async () => {
    renderComponent();

    act(() => {
      vi.advanceTimersByTime((3 * 60 + 45) * 60 * 1000);
    });

    const signOutBtn = screen.getByRole('button', { name: /sign out/i });
    await act(async () => {
      fireEvent.click(signOutBtn);
    });

    expect(api.post).toHaveBeenCalledWith('/auth/logout', expect.anything());
  });
});

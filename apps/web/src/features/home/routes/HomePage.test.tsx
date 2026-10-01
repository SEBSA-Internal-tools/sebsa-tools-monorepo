import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import type { Role, User } from '@sdp/contracts';
import { renderWithProviders } from '@/test/renderWithProviders.tsx';
import { HomePage } from './HomePage.tsx';

function makeUser(roles: Role[]): User {
  return {
    id: 'u-charith',
    name: 'Charith Widanapathirana',
    email: 'charith.widanapathirana@sebsaworld.com',
    roles,
    isActive: true,
    createdAt: '2025-01-14T09:00:00.000Z',
  };
}

describe('HomePage workspace gating (spec FL 2.1-02)', () => {
  it('shows only the developer workspace for a developer', async () => {
    renderWithProviders(<HomePage user={makeUser(['Developer'])} />);

    expect(await screen.findByRole('heading', { name: 'Developer' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Reviewer' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Admin' })).not.toBeInTheDocument();
  });

  it('shows only the reviewer workspace for a reviewer', async () => {
    renderWithProviders(<HomePage user={makeUser(['Reviewer'])} />);

    expect(await screen.findByRole('heading', { name: 'Reviewer' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Developer' })).not.toBeInTheDocument();
  });

  it('gives an admin only the admin workspace; each workspace needs its own role', async () => {
    renderWithProviders(<HomePage user={makeUser(['Admin'])} />);

    expect(await screen.findByRole('heading', { name: 'Admin' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Developer' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Reviewer' })).not.toBeInTheDocument();
  });

  it('tells a user with no roles to contact an administrator', async () => {
    renderWithProviders(<HomePage user={makeUser([])} />);

    expect(
      await screen.findByText(/No workspaces are assigned to your account/i),
    ).toBeInTheDocument();
  });
});

describe('HomePage data seam', () => {
  it('fetches the task count through apiClient and MSW', async () => {
    // Exercises the whole Phase 1 path — fetch to /api/tasks/summary, MSW
    // handler, Zod response parsing — not a stubbed return value.
    renderWithProviders(<HomePage user={makeUser(['Admin'])} />);

    await waitFor(() => {
      expect(screen.getByText(/\d+ total tasks/)).toBeInTheDocument();
    });
  });

  it('greets the signed-in user by name', async () => {
    renderWithProviders(<HomePage user={makeUser(['Developer'])} />);
    expect(await screen.findByText('Charith Widanapathirana')).toBeInTheDocument();
  });
});

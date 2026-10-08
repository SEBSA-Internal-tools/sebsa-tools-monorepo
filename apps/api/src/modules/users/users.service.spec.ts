import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { UsersService } from './users.service.js';

const audit = { record: vi.fn().mockResolvedValue(undefined) };

const actor: AuthenticatedUser = {
  id: '122f5c16-7522-4b2e-b9b4-a6ac68fbf713',
  email: 'super.admin@example.com',
  name: 'Super Admin',
  roles: ['SUPER_ADMIN'],
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  sessionId: 'session-id',
};

describe('UsersService', () => {
  it('creates every role assignment through valid nested relations', async () => {
    const createdAt = new Date('2026-09-21T00:00:00.000Z');
    const create = vi.fn().mockResolvedValue({
      id: 'cb17b073-8fb2-4abe-83b7-7f36f1af4682',
      email: 'new.user@example.com',
      fullName: 'New User',
      status: 'ACTIVE',
      createdAt,
      userRoles: [
        { role: { id: 1, code: 'DEVELOPER', name: 'Developer', description: null } },
        { role: { id: 3, code: 'ADMIN', name: 'Admin', description: null } },
      ],
    });
    const transaction = { user: { create } };
    const prisma = {
      role: {
        findMany: vi.fn().mockResolvedValue([
          { id: 1, code: 'DEVELOPER' },
          { id: 3, code: 'ADMIN' },
        ]),
      },
      $transaction: vi.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
      ),
    };
    const service = new UsersService(prisma as never, audit as never);

    await service.create(
      {
        name: 'New User',
        email: 'NEW.USER@example.com',
        roles: ['DEVELOPER', 'ADMIN'],
      },
      actor,
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'new.user@example.com',
          userRoles: {
            create: [
              {
                grantor: { connect: { id: actor.id } },
                role: { connect: { id: 1 } },
              },
              {
                grantor: { connect: { id: actor.id } },
                role: { connect: { id: 3 } },
              },
            ],
          },
        }),
      }),
    );
  });

  it('marks a user inactive and deleted without removing their record or role history', async () => {
    const update = vi.fn().mockResolvedValue({});
    const transaction = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      user: { update },
    };
    const prisma = {
      user: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'cb17b073-8fb2-4abe-83b7-7f36f1af4682',
          email: 'developer@example.com',
          fullName: 'Developer',
          status: 'ACTIVE',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          userRoles: [{ role: { code: 'DEVELOPER' } }],
        }),
      },
      $transaction: vi.fn(async (operation: (tx: typeof transaction) => Promise<void>) =>
        operation(transaction),
      ),
    };
    const service = new UsersService(prisma as never, audit as never);

    await service.remove('cb17b073-8fb2-4abe-83b7-7f36f1af4682', actor);

    expect(update).toHaveBeenCalledWith({
      where: { id: 'cb17b073-8fb2-4abe-83b7-7f36f1af4682' },
      data: { status: 'INACTIVE', deletedAt: expect.any(Date) },
    });
  });
});

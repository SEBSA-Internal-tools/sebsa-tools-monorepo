import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { UserRolesService } from './user-roles.service.js';

const actor: AuthenticatedUser = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'current@example.com',
  name: 'Current Super Admin',
  roles: ['SUPER_ADMIN'],
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  sessionId: 'session',
};

const adminRole = {
  id: 3,
  code: 'ADMIN',
  name: 'Administrator',
  description: null,
  deletedAt: null,
};
const superAdminRole = {
  id: 4,
  code: 'SUPER_ADMIN',
  name: 'Super Administrator',
  description: null,
  deletedAt: null,
};

function user(id: string, roles: (typeof adminRole)[]) {
  return {
    id,
    email: `${id}@example.com`,
    fullName: id === actor.id ? actor.name : 'Target Admin',
    status: 'ACTIVE' as const,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    userRoles: roles.map((role) => ({ role })),
  };
}

function harness(targetRoles: (typeof adminRole)[]) {
  const targetId = '00000000-0000-0000-0000-000000000002';
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    role: { findMany: vi.fn().mockResolvedValue([adminRole, superAdminRole]) },
    userRole: {
      findMany: vi
        .fn()
        .mockResolvedValue([{ userId: actor.id, user: user(actor.id, [superAdminRole]) }]),
      upsert: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn().mockResolvedValue(undefined),
    },
    user: {
      findFirst: vi.fn().mockResolvedValue(user(targetId, targetRoles)),
      findUniqueOrThrow: vi.fn().mockResolvedValue(user(targetId, [superAdminRole])),
    },
    auditLog: { create: vi.fn().mockResolvedValue(undefined) },
  };
  const prisma = {
    $transaction: vi.fn((callback: (client: typeof tx) => unknown) =>
      Promise.resolve(callback(tx)),
    ),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const service = new UserRolesService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
  );
  return { audit, service, targetId, tx };
}

describe('UserRolesService.transferSuperAdmin', () => {
  it('atomically moves Super Admin to an existing Admin and keeps the previous owner Admin', async () => {
    const { audit, service, targetId, tx } = harness([adminRole]);

    await expect(service.transferSuperAdmin(targetId, actor)).resolves.toMatchObject({
      id: targetId,
      roles: ['Super Admin'],
    });
    expect(tx.userRole.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_roleId: { userId: actor.id, roleId: adminRole.id } },
      }),
    );
    expect(tx.userRole.delete).toHaveBeenCalledWith({
      where: { userId_roleId: { userId: actor.id, roleId: superAdminRole.id } },
    });
    expect(tx.userRole.create).toHaveBeenCalledWith({
      data: { userId: targetId, roleId: superAdminRole.id, grantedBy: actor.id },
    });
    expect(tx.userRole.deleteMany).toHaveBeenCalledWith({
      where: { userId: targetId, roleId: { not: superAdminRole.id } },
    });
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      actor,
      expect.objectContaining({ actionType: 'SUPER_ADMIN_TRANSFERRED', targetUserId: targetId }),
    );
  });

  it('rejects a target who does not already hold Admin', async () => {
    const { service, targetId, tx } = harness([]);

    await expect(service.transferSuperAdmin(targetId, actor)).rejects.toThrow(BadRequestException);
    expect(tx.userRole.delete).not.toHaveBeenCalled();
    expect(tx.userRole.create).not.toHaveBeenCalled();
  });
});

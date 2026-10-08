import { ConflictException } from '@nestjs/common';
import { validate } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';
import { CreateTaskTypeDto } from './dto/create-task-type.dto.js';
import { TaskTypesService } from './task-types.service.js';

function stored(overrides: Record<string, unknown> = {}) {
  return {
    id: 2,
    code: 'CUSTOMIZATION',
    name: 'Customization',
    description: null,
    isActive: true,
    ...overrides,
  };
}

describe('TaskTypesService management', () => {
  it('accepts the existing frontend name-only create payload', async () => {
    const dto = Object.assign(new CreateTaskTypeDto(), { name: 'Test' });

    await expect(validate(dto, { whitelist: true, forbidNonWhitelisted: true })).resolves.toEqual(
      [],
    );
  });

  it('creates a task type from the frontend name-only payload', async () => {
    const created = stored({ id: 3, code: 'UPGRADE_SERVICE', name: 'Upgrade Service' });
    const tx = {
      taskType: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue(created),
      },
    };
    const prisma = {
      taskType: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([created]),
      },
      $transaction: vi.fn((operation: (client: typeof tx) => unknown) => operation(tx)),
    };
    const service = new TaskTypesService(prisma as never);

    await expect(service.create({ name: ' Upgrade Service ' })).resolves.toEqual({
      id: '3',
      name: 'Upgrade Service',
      order: 1,
      isActive: true,
    });
    expect(tx.taskType.create).toHaveBeenCalledWith({
      data: {
        code: 'UPGRADE_SERVICE',
        name: 'Upgrade Service',
        description: null,
      },
    });
  });

  it('returns the existing frontend record shape after editing or deactivating', async () => {
    const existing = {
      ...stored(),
      checklistSections: [],
      _count: { tasks: 0 },
    };
    const updated = stored({ name: 'Configuration', isActive: false });
    const prisma = {
      taskType: {
        findUnique: vi.fn().mockResolvedValue(existing),
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue(updated),
        findMany: vi.fn().mockResolvedValue([updated]),
      },
    };
    const service = new TaskTypesService(prisma as never);

    await expect(service.update(2, { name: ' Configuration ', isActive: false })).resolves.toEqual({
      id: '2',
      name: 'Configuration',
      order: 1,
      isActive: false,
    });
    expect(prisma.taskType.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { name: 'Configuration', isActive: false },
    });
  });

  it('permanently deletes an unused task type', async () => {
    const prisma = {
      taskType: {
        findUnique: vi.fn().mockResolvedValue({
          ...stored(),
          checklistSections: [],
          _count: { tasks: 0 },
        }),
        delete: vi.fn().mockResolvedValue(stored()),
      },
    };
    const service = new TaskTypesService(prisma as never);

    await expect(service.remove(2)).resolves.toBeUndefined();
    expect(prisma.taskType.delete).toHaveBeenCalledWith({ where: { id: 2 } });
  });

  it('protects task and checklist relationships from permanent deletion', async () => {
    const prisma = {
      taskType: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({
            ...stored(),
            checklistSections: [],
            _count: { tasks: 1 },
          })
          .mockResolvedValueOnce({
            ...stored(),
            checklistSections: [{ section: { id: 'section-1' } }],
            _count: { tasks: 0 },
          }),
        delete: vi.fn(),
      },
    };
    const service = new TaskTypesService(prisma as never);

    await expect(service.remove(2)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.remove(2)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.taskType.delete).not.toHaveBeenCalled();
  });
});

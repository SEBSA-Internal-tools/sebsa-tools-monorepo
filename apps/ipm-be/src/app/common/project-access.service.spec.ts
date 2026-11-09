import 'reflect-metadata';
import { ForbiddenException, ValidationPipe } from '@nestjs/common';
import { AuthUser } from '@sebsa-pm-tool/shared-models';
import { UpdateCaseDto } from '../cases/dto/update-case.dto';
import { ProjectAccessService } from './project-access.service';
import { changesOnlyAssignees } from './assignee-only-change';

const group = (over: Record<string, boolean> = {}) => ({
  isReadOnly: false,
  canEditCase: false,
  canEditTask: false,
  canManageMembers: false,
  ...over,
});

function serviceFor(privilegeGroup: ReturnType<typeof group> | null) {
  const prisma = {
    projectMember: {
      findFirst: jest.fn().mockResolvedValue(privilegeGroup ? { role: { privilegeGroup } } : null),
    },
  };
  return new ProjectAccessService(prisma as never);
}

const member = { id: 'me', systemRole: 'REGULAR_USER' } as AuthUser;

describe('ProjectAccessService assignment rules', () => {
  it('lets a member without the edit grant assign themselves', async () => {
    const svc = serviceFor(group());
    await expect(svc.assertCanAssign('p', member, ['me'], 'canEditCase')).resolves.toBeUndefined();
    await expect(svc.assertCanSetAssignees('p', member, ['me'], [], 'canEditCase')).resolves.toBeUndefined();
  });

  it('refuses assigning someone else without manage-members', async () => {
    const svc = serviceFor(group({ canEditCase: true }));
    await expect(svc.assertCanAssign('p', member, ['other'], 'canEditCase')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('lets a manager assign others', async () => {
    const svc = serviceFor(group({ canEditCase: true, canManageMembers: true }));
    await expect(svc.assertCanAssign('p', member, ['other'], 'canEditCase')).resolves.toBeUndefined();
  });

  it('refuses read-only members even for themselves', async () => {
    const svc = serviceFor(group({ isReadOnly: true }));
    await expect(svc.assertCanAssign('p', member, ['me'], 'canEditCase')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('treats an assignee-only PATCH body as assignee-only after validation', async () => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
    const dto = (await pipe.transform(
      { assigneeIds: ['11111111-1111-4111-8111-111111111111'] },
      { type: 'body', metatype: UpdateCaseDto },
    )) as UpdateCaseDto;
    const assigneesOnly = Object.entries(dto).every(
      ([key, value]) => key === 'assigneeIds' || value === undefined,
    );
    expect(assigneesOnly).toBe(true);
  });
});

describe('changesOnlyAssignees', () => {
  const stored = {
    title: 'T',
    description: null,
    dueDate: new Date('2026-12-01T00:00:00.000Z'),
    storyPoints: 3,
    category: 'FUNCTIONAL',
  };

  it('ignores fields that match the stored values', () => {
    const dto = {
      title: 'T',
      description: undefined,
      dueDate: '2026-12-01',
      storyPoints: 3,
      category: 'FUNCTIONAL',
      assigneeIds: ['me'],
    };
    expect(changesOnlyAssignees(dto, stored)).toBe(true);
  });

  it('detects a real change to another field', () => {
    expect(changesOnlyAssignees({ title: 'New', assigneeIds: ['me'] }, stored)).toBe(false);
    expect(changesOnlyAssignees({ dueDate: '2026-12-02', assigneeIds: ['me'] }, stored)).toBe(false);
  });

  it('is false when no assignee list is sent', () => {
    expect(changesOnlyAssignees({ title: 'T' }, stored)).toBe(false);
  });
});

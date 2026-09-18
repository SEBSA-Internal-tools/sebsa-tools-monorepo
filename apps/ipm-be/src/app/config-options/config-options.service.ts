import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@sebsa-pm-tool/core';
import { ConfigKind, ConfigScope, Prisma } from '@prisma/client';
import { ConfigOption } from '@sebsa-pm-tool/shared-models';
import {
  CreateConfigOptionDto, FilterConfigOptionsDto, ReorderConfigOptionsDto, UpdateConfigOptionDto,
} from './dto/config-option.dto';

/** Lists whose entries carry completion semantics; the flags are meaningless
 * on the others and are rejected there rather than silently stored. */
const STATUS_KINDS: ConfigKind[] = [
  ConfigKind.PROJECT_STATUS,
  ConfigKind.CASE_STATUS,
  ConfigKind.TASK_STATUS,
  ConfigKind.SUBTASK_STATUS,
];

@Injectable()
export class ConfigOptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filter: FilterConfigOptionsDto): Promise<ConfigOption[]> {
    const rows = await this.prisma.configOption.findMany({
      where: {
        scope: filter.scope ?? ConfigScope.GLOBAL,
        ...(filter.kind && { kind: filter.kind }),
        // Absent parentId means top-level entries only, so a task-type list is
        // not polluted by the complexity levels nested under it.
        parentId: filter.parentId ?? null,
        ...(filter.includeInactive !== 'true' && { isActive: true }),
      },
      orderBy: [{ kind: 'asc' }, { order: 'asc' }],
    });
    return rows;
  }

  async create(dto: CreateConfigOptionDto): Promise<ConfigOption> {
    this.assertFlagsValidForKind(dto.kind, dto);

    const key = await this.deriveKey(dto.kind, dto.scope, dto.label);

    // Appending is the only sane default; reordering is a separate action.
    const last = await this.prisma.configOption.findFirst({
      where: { kind: dto.kind, scope: dto.scope, parentId: dto.parentId ?? null },
      orderBy: { order: 'desc' },
      select: { order: true },
    });

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await this.clearDefault(tx, dto.kind, dto.scope);
      }

      return tx.configOption.create({
        data: {
          kind: dto.kind,
          scope: dto.scope,
          key,
          label: dto.label.trim(),
          color: dto.color ?? null,
          order: (last?.order ?? 0) + 1,
          parentId: dto.parentId ?? null,
          isDefault: dto.isDefault ?? false,
          isCompleted: dto.isCompleted ?? false,
          isCancelled: dto.isCancelled ?? false,
          isSystem: false,
        },
      });
    });
  }

  async update(id: string, dto: UpdateConfigOptionDto): Promise<ConfigOption> {
    const existing = await this.getOrThrow(id);
    this.assertFlagsValidForKind(existing.kind, dto);

    // Deactivating the fallback would leave new records with nothing to take.
    if (dto.isActive === false && existing.isDefault) {
      throw new BadRequestException(
        'Set another entry as the default before deactivating this one.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await this.clearDefault(tx, existing.kind, existing.scope);
      }

      return tx.configOption.update({
        where: { id },
        data: {
          ...(dto.label !== undefined && { label: dto.label.trim() }),
          ...(dto.color !== undefined && { color: dto.color }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
          ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
          ...(dto.isCompleted !== undefined && { isCompleted: dto.isCompleted }),
          ...(dto.isCancelled !== undefined && { isCancelled: dto.isCancelled }),
        },
      });
    });
  }

  async remove(id: string): Promise<{ message: string }> {
    const existing = await this.getOrThrow(id);

    // Application logic matches on seeded keys, so removing one would break
    // behaviour that no longer has a matching row.
    if (existing.isSystem) {
      throw new BadRequestException(
        'Built-in entries cannot be deleted. Deactivate it instead.',
      );
    }
    if (existing.isDefault) {
      throw new BadRequestException('Set another entry as the default before deleting this one.');
    }

    await this.prisma.configOption.delete({ where: { id } });
    return { message: 'Configuration entry deleted.' };
  }

  /** Rewrites the whole list's ordering in one transaction so no intermediate
   * state has two entries claiming the same position. */
  async reorder(
    kind: ConfigKind,
    scope: ConfigScope,
    dto: ReorderConfigOptionsDto,
  ): Promise<ConfigOption[]> {
    const existing = await this.prisma.configOption.findMany({
      where: { kind, scope },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((row) => row.id));

    if (dto.orderedIds.length !== existingIds.size ||
        dto.orderedIds.some((id) => !existingIds.has(id))) {
      throw new BadRequestException('The ordering must list every entry in this list exactly once.');
    }

    await this.prisma.$transaction(
      dto.orderedIds.map((id, index) =>
        this.prisma.configOption.update({ where: { id }, data: { order: index + 1 } }),
      ),
    );

    return this.findAll({ kind, scope, includeInactive: 'true' });
  }

  // ---------------------------------------------------------------------------

  private async getOrThrow(id: string) {
    const option = await this.prisma.configOption.findUnique({ where: { id } });
    if (!option) throw new NotFoundException('Configuration entry not found.');
    return option;
  }

  private async clearDefault(
    tx: Prisma.TransactionClient,
    kind: ConfigKind,
    scope: ConfigScope,
  ): Promise<void> {
    await tx.configOption.updateMany({
      where: { kind, scope, isDefault: true },
      data: { isDefault: false },
    });
  }

  private assertFlagsValidForKind(
    kind: ConfigKind,
    dto: { isCompleted?: boolean; isCancelled?: boolean },
  ): void {
    if (STATUS_KINDS.includes(kind)) return;
    if (dto.isCompleted || dto.isCancelled) {
      throw new BadRequestException(
        'Completion flags only apply to status lists.',
      );
    }
  }

  /** Derives a stable SCREAMING_SNAKE key from the label, since the key is what
   * logic matches on and must not contain formatting the admin might later edit. */
  private async deriveKey(kind: ConfigKind, scope: ConfigScope, label: string): Promise<string> {
    const base = label.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (!base) throw new BadRequestException('Label must contain at least one letter or number.');

    const clash = await this.prisma.configOption.findUnique({
      where: { kind_scope_key: { kind, scope, key: base } },
      select: { id: true },
    });
    if (clash) throw new ConflictException(`An entry named "${label}" already exists in this list.`);

    return base;
  }
}

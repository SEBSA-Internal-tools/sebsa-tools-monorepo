import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { rethrowPrismaConflict } from '../../common/prisma-errors.js';
import type { CreateCustomerDto } from './dto/create-customer.dto.js';
import type { UpdateCustomerDto } from './dto/update-customer.dto.js';
import { formatTaskCode } from '../review-tasks/task-code.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { AuditService } from '../audit/audit.service.js';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}
  async findAll() {
    const customers = await this.prisma.customer.findMany({
      include: { creator: true },
      orderBy: { name: 'asc' },
    });
    return customers.map((customer) => this.toResponse(customer));
  }
  async findOne(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: { creator: true },
    });
    if (!customer) throw new NotFoundException(`Customer ${id} was not found`);
    return this.toResponse(customer);
  }
  async nextTaskId(id: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException(`Customer ${id} was not found`);
    const aggregate = await this.prisma.task.aggregate({
      where: { customerId: id },
      _max: { customerSequenceNo: true },
    });
    const sequence = (aggregate._max.customerSequenceNo ?? 0) + 1;
    return { taskCode: formatTaskCode(customer.name, sequence), sequence };
  }
  async create(dto: CreateCustomerDto, actor: AuthenticatedUser) {
    try {
      const customer = await this.prisma.$transaction(async (tx) => {
        const created = await tx.customer.create({
          data: {
            ...dto,
            code: dto.code.trim().toUpperCase(),
            name: dto.name.trim(),
            createdBy: actor.id,
          },
          include: { creator: true },
        });
        await this.audit.record(tx, actor, {
          actionType: 'CUSTOMER_CREATED',
          entityType: 'CUSTOMER',
          entityId: created.id,
          description: `${actor.name} created customer ${created.name}`,
          newValue: { code: created.code, name: created.name, status: created.status },
        });
        return created;
      });
      return this.toResponse(customer);
    } catch (error) {
      rethrowPrismaConflict(error);
    }
  }
  async update(id: string, dto: UpdateCustomerDto, actor: AuthenticatedUser) {
    const existing = await this.findOne(id);
    try {
      const customer = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.customer.update({
          where: { id },
          data: {
            ...dto,
            ...(dto.code === undefined ? {} : { code: dto.code.trim().toUpperCase() }),
            ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
          },
          include: { creator: true },
        });
        const actionType =
          dto.status === undefined
            ? 'CUSTOMER_UPDATED'
            : dto.status === 'ACTIVE'
              ? 'CUSTOMER_ACTIVATED'
              : 'CUSTOMER_DEACTIVATED';
        await this.audit.record(tx, actor, {
          actionType,
          entityType: 'CUSTOMER',
          entityId: id,
          description: `${actor.name} ${actionType.toLowerCase().replaceAll('_', ' ')} ${existing.name}`,
          oldValue: existing,
          newValue: this.toResponse(updated),
        });
        return updated;
      });
      return this.toResponse(customer);
    } catch (error) {
      rethrowPrismaConflict(error);
    }
  }
  async remove(id: string, actor: AuthenticatedUser) {
    const existing = await this.findOne(id);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const deleted = await tx.customer.delete({ where: { id } });
        await this.audit.record(tx, actor, {
          actionType: 'CUSTOMER_DELETED',
          entityType: 'CUSTOMER',
          entityId: id,
          description: `${actor.name} deleted customer ${existing.name}`,
          oldValue: existing,
        });
        return deleted;
      });
    } catch (error) {
      rethrowPrismaConflict(error);
    }
  }

  private toResponse(customer: {
    id: string;
    code: string;
    name: string;
    description: string | null;
    color: string | null;
    status: string;
  }) {
    return {
      id: customer.id,
      code: customer.code,
      name: customer.name,
      description: customer.description ?? '',
      color: customer.color ?? '#64748b',
      isActive: customer.status === 'ACTIVE',
    };
  }
}

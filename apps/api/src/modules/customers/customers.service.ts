import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { rethrowPrismaConflict } from '../../common/prisma-errors.js';
import type { CreateCustomerDto } from './dto/create-customer.dto.js';
import type { UpdateCustomerDto } from './dto/update-customer.dto.js';
import { formatTaskCode } from '../review-tasks/task-code.js';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}
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
  async create(dto: CreateCustomerDto, createdBy: string) {
    try {
      const customer = await this.prisma.customer.create({
        data: {
          ...dto,
          code: dto.code.trim().toUpperCase(),
          name: dto.name.trim(),
          createdBy,
        },
        include: { creator: true },
      });
      return this.toResponse(customer);
    } catch (error) {
      rethrowPrismaConflict(error);
    }
  }
  async update(id: string, dto: UpdateCustomerDto) {
    await this.findOne(id);
    try {
      const customer = await this.prisma.customer.update({
        where: { id },
        data: {
          ...dto,
          ...(dto.code === undefined ? {} : { code: dto.code.trim().toUpperCase() }),
          ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
        },
        include: { creator: true },
      });
      return this.toResponse(customer);
    } catch (error) {
      rethrowPrismaConflict(error);
    }
  }
  async remove(id: string) {
    await this.findOne(id);
    try {
      return await this.prisma.customer.delete({ where: { id } });
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

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { rethrowPrismaConflict } from '../../common/prisma-errors.js';
import type { CreateCustomerDto } from './dto/create-customer.dto.js';
import type { UpdateCustomerDto } from './dto/update-customer.dto.js';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}
  findAll() {
    return this.prisma.customer.findMany({
      include: { creator: true },
      orderBy: { name: 'asc' },
    });
  }
  async findOne(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: { creator: true },
    });
    if (!customer) throw new NotFoundException(`Customer ${id} was not found`);
    return customer;
  }
  async create(dto: CreateCustomerDto, createdBy: string) {
    try {
      return await this.prisma.customer.create({
        data: {
          ...dto,
          code: dto.code.trim().toUpperCase(),
          name: dto.name.trim(),
          createdBy,
        },
        include: { creator: true },
      });
    } catch (error) {
      rethrowPrismaConflict(error);
    }
  }
  async update(id: string, dto: UpdateCustomerDto) {
    await this.findOne(id);
    try {
      return await this.prisma.customer.update({
        where: { id },
        data: {
          ...dto,
          ...(dto.code === undefined ? {} : { code: dto.code.trim().toUpperCase() }),
          ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
        },
        include: { creator: true },
      });
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
}

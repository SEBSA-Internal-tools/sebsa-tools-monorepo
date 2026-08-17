import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@sebsa-pm-tool/core';
import { Customer } from '@sebsa-pm-tool/shared-models';
import { Prisma } from '@prisma/client';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

const customerWithCountInclude = {
  _count: { select: { projects: { where: { deletedAt: null } } } },
} satisfies Prisma.CustomerInclude;

type CustomerWithCount = Prisma.CustomerGetPayload<{ include: typeof customerWithCountInclude }>;

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<Customer[]> {
    const customers = await this.prisma.customer.findMany({
      where: { deletedAt: null },
      include: customerWithCountInclude,
      orderBy: { name: 'asc' },
    });
    return customers.map((customer) => this.toCustomer(customer));
  }

  async findOne(id: string): Promise<Customer> {
    const customer = await this.getOrThrow(id);
    return this.toCustomer(customer);
  }

  async create(dto: CreateCustomerDto): Promise<Customer> {
    await this.assertNameAvailable(dto.name);

    const customer = await this.prisma.customer.create({
      data: {
        name: dto.name,
        contactEmail: dto.contactEmail,
        contactPhone: dto.contactPhone,
        notes: dto.notes,
      },
      include: customerWithCountInclude,
    });
    return this.toCustomer(customer);
  }

  async update(id: string, dto: UpdateCustomerDto): Promise<Customer> {
    await this.getOrThrow(id);
    if (dto.name) {
      await this.assertNameAvailable(dto.name, id);
    }

    const customer = await this.prisma.customer.update({
      where: { id },
      data: {
        name: dto.name,
        contactEmail: dto.contactEmail,
        contactPhone: dto.contactPhone,
        notes: dto.notes,
      },
      include: customerWithCountInclude,
    });
    return this.toCustomer(customer);
  }

  async remove(id: string): Promise<void> {
    await this.getOrThrow(id);

    const activeProjectCount = await this.prisma.project.count({
      where: { customerId: id, deletedAt: null },
    });
    if (activeProjectCount > 0) {
      throw new ConflictException(
        `Cannot delete: ${activeProjectCount} project(s) still belong to this customer.`,
      );
    }

    await this.prisma.customer.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  private async getOrThrow(id: string): Promise<CustomerWithCount> {
    const customer = await this.prisma.customer.findFirst({
      where: { id, deletedAt: null },
      include: customerWithCountInclude,
    });
    if (!customer) {
      throw new NotFoundException('Customer not found.');
    }
    return customer;
  }

  private async assertNameAvailable(name: string, excludingId?: string): Promise<void> {
    const existing = await this.prisma.customer.findFirst({
      where: { name, deletedAt: null, ...(excludingId && { id: { not: excludingId } }) },
    });
    if (existing) {
      throw new ConflictException('A customer with this name already exists.');
    }
  }

  private toCustomer(customer: CustomerWithCount): Customer {
    return {
      id: customer.id,
      name: customer.name,
      contactEmail: customer.contactEmail,
      contactPhone: customer.contactPhone,
      notes: customer.notes,
      projectCount: customer._count.projects,
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString(),
    };
  }
}

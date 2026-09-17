import { describe, expect, it, vi } from 'vitest';
import { CustomersService } from './customers.service.js';

describe('CustomersService next Task ID', () => {
  it('calculates the next sequence independently for each customer', async () => {
    const prisma = {
      customer: {
        findUnique: vi.fn(({ where }: { where: { id: string } }) => {
          return Promise.resolve(
            where.id === 'customer-a'
              ? { id: 'customer-a', name: 'Sample Customer A' }
              : { id: 'customer-b', name: 'Sample Customer B' },
          );
        }),
      },
      task: {
        aggregate: vi.fn(({ where }: { where: { customerId: string } }) => {
          return Promise.resolve({
            _max: { customerSequenceNo: where.customerId === 'customer-a' ? 2 : null },
          });
        }),
      },
    };
    const service = new CustomersService(prisma as never);

    await expect(service.nextTaskId('customer-a')).resolves.toEqual({
      taskCode: 'SAMPLECUSTOMERA-03',
      sequence: 3,
    });
    await expect(service.nextTaskId('customer-b')).resolves.toEqual({
      taskCode: 'SAMPLECUSTOMERB-01',
      sequence: 1,
    });
  });
});

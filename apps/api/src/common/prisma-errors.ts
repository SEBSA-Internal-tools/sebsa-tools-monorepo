import { Prisma } from '@prisma/client';
import { ApiException } from './api-error.js';

export function rethrowPrismaConflict(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      throw new ApiException(
        'VALIDATION_FAILED',
        'A record with the same unique value already exists',
      );
    }
    if (error.code === 'P2003' || error.code === 'P2014') {
      throw new ApiException('INVALID_STATE_TRANSITION', 'The record is referenced by other data');
    }
    if (error.code === 'P2025') {
      throw new ApiException('VALIDATION_FAILED', 'A referenced record does not exist');
    }
    if (error.code === 'P2034') {
      throw new ApiException(
        'VERSION_CONFLICT',
        'The operation conflicted with another request; please retry',
      );
    }
  }
  throw error;
}

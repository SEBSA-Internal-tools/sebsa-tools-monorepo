import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export function rethrowPrismaConflict(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      throw new ConflictException(
        'A record with the same unique value already exists',
      );
    }
    if (error.code === 'P2003' || error.code === 'P2014') {
      throw new ConflictException('The record is referenced by other data');
    }
    if (error.code === 'P2025') {
      throw new BadRequestException('A referenced record does not exist');
    }
    if (error.code === 'P2034') {
      throw new ConflictException(
        'The operation conflicted with another request; please retry',
      );
    }
  }
  throw error;
}


import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TaskTypesController } from './task-types.controller';
import { TaskTypesService } from './task-types.service';

@Module({
  imports: [AuthModule],
  controllers: [TaskTypesController],
  providers: [TaskTypesService],
  exports: [TaskTypesService],
})
export class TaskTypesModule {}

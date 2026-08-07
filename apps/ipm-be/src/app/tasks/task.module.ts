import { Module } from '@nestjs/common';
import { TaskService } from './task.service';
import { TaskController } from './task.controller';
import { LabelsController } from './labels.controller';
import { LabelsService } from './labels.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [TaskController, LabelsController],
  providers: [TaskService, LabelsService],
})
export class TaskModule {}

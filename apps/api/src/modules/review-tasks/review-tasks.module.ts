import { Module } from '@nestjs/common';
import { ReviewTasksController } from './review-tasks.controller.js';
import { ReviewTasksService } from './review-tasks.service.js';

@Module({
  controllers: [ReviewTasksController],
  providers: [ReviewTasksService],
})
export class ReviewTasksModule {}


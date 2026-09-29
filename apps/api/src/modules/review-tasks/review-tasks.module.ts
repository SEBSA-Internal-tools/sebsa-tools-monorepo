import { Module } from '@nestjs/common';
import { ReviewTasksController } from './review-tasks.controller.js';
import { ReviewTasksService } from './review-tasks.service.js';

@Module({
  controllers: [ReviewTasksController],
  providers: [ReviewTasksService],
  exports: [ReviewTasksService],
})
export class ReviewTasksModule {}

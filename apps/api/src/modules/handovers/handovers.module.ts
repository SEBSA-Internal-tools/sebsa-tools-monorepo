import { Module } from '@nestjs/common';
import { AdminHandoversController, ReviewerHandoversController } from './handovers.controller.js';
import { HandoversService } from './handovers.service.js';
import { ReviewTasksModule } from '../review-tasks/review-tasks.module.js';

@Module({
  imports: [ReviewTasksModule],
  controllers: [ReviewerHandoversController, AdminHandoversController],
  providers: [HandoversService],
})
export class HandoversModule {}

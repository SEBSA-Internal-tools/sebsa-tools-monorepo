import { Module } from '@nestjs/common';
import { SubtaskService } from './subtask.service';
import { SubtaskController } from './subtask.controller';
import { AuthModule } from '../auth/auth.module';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { NotificationModule } from '../notifications/notification.module';

@Module({
  imports: [AuthModule, ActivityLogsModule, NotificationModule],
  controllers: [SubtaskController],
  providers: [SubtaskService],
})
export class SubtaskModule {}

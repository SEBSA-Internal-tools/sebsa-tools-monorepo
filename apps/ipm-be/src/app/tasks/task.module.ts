import { Module } from '@nestjs/common';
import { TaskService } from './task.service';
import { TaskController } from './task.controller';
import { LabelsController } from './labels.controller';
import { LabelsService } from './labels.service';
import { AuthModule } from '../auth/auth.module';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { JiraModule } from '../jira/jira.module';
import { NotificationModule } from '../notifications/notification.module';

@Module({
  imports: [AuthModule, ActivityLogsModule, JiraModule, NotificationModule],
  controllers: [TaskController, LabelsController],
  providers: [TaskService, LabelsService],
})
export class TaskModule {}

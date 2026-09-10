import { Module } from '@nestjs/common';
import { CaseService } from './case.service';
import { CaseController } from './case.controller';
import { AuthModule } from '../auth/auth.module';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { NotificationModule } from '../notifications/notification.module';

@Module({
  imports: [AuthModule, ActivityLogsModule, NotificationModule],
  controllers: [CaseController],
  providers: [CaseService],
})
export class CaseModule {}

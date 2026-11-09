import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { NotificationModule } from '../notifications/notification.module';
import { CommentsService } from './comments.service';
import { CommentsController } from './comments.controller';

@Module({
  imports: [AuthModule, ActivityLogsModule, NotificationModule],
  controllers: [CommentsController],
  providers: [CommentsService],
})
export class CommentsModule {}

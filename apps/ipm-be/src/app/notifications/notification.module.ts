import { Module } from '@nestjs/common';
import { PrismaModule } from '@sebsa-pm-tool/core';
import { AuthModule } from '../auth/auth.module';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { NotificationSchedulerService } from './notification-scheduler.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [NotificationController],
  providers: [NotificationService, NotificationSchedulerService],
  exports: [NotificationService],
})
export class NotificationModule {}

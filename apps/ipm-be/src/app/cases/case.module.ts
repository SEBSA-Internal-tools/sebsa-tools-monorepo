import { Module } from '@nestjs/common';
import { CaseService } from './case.service';
import { CaseController } from './case.controller';
import { AuthModule } from '../auth/auth.module';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';

@Module({
  imports: [AuthModule, ActivityLogsModule],
  controllers: [CaseController],
  providers: [CaseService],
})
export class CaseModule {}

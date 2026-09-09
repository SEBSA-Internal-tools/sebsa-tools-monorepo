import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ActivityLogsService } from './activity-logs.service';
import { ActivityLogsController } from './activity-logs.controller';
import { AuditLogsController } from './audit-logs.controller';

/**
 * Exports ActivityLogsService so the domain modules (projects, cases, tasks,
 * subtasks) can append to the ledger from inside their own transactions.
 */
@Module({
  imports: [AuthModule],
  controllers: [ActivityLogsController, AuditLogsController],
  providers: [ActivityLogsService],
  exports: [ActivityLogsService],
})
export class ActivityLogsModule {}

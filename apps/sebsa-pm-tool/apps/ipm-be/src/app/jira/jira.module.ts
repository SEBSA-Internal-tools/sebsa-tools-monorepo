import { Module } from '@nestjs/common';
import { PrismaModule } from '@sebsa-pm-tool/core';
import { AuthModule } from '../auth/auth.module';
import { JiraClientService } from './jira-client.service';
import { JiraSyncService } from './jira-sync.service';
import { JiraPollService } from './jira-poll.service';
import { JiraController } from './jira.controller';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [JiraController],
  providers: [JiraClientService, JiraSyncService, JiraPollService],
  exports: [JiraSyncService],
})
export class JiraModule {}

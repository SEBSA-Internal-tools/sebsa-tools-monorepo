import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from '@sebsa-pm-tool/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CustomersModule } from './customers/customers.module';
import { DepartmentsModule } from './departments/departments.module';
import { PrivilegeGroupsModule } from './privilege-groups/privilege-groups.module';
import { ProjectsModule } from './projects/projects.module';
import { UsersModule } from './users/users.module';
import appConfig from '../config/app.config';
import authConfig from '../config/auth.config';
import databaseConfig from '../config/database.config';
import jiraConfig from '../config/jira.config';
import { envValidationSchema } from '../config/env.validation';
import { TaskModule } from './tasks/task.module';
import { CaseModule } from './cases/case.module';
import { SubtaskModule } from './subtasks/subtask.module';
import { SprintsModule } from './sprints/sprints.module';
import { JiraModule } from './jira/jira.module';
import { ActivityLogsModule } from './activity-logs/activity-logs.module';
import { CommentsModule } from './comments/comments.module';
import { ConfigOptionsModule } from './config-options/config-options.module';
import { FriendlyThrottlerGuard } from './common/friendly-throttler.guard';
import { CommonModule } from './common/common.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { NotificationModule } from './notifications/notification.module';
import { AttachmentsModule } from './attachments/attachments.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, authConfig, databaseConfig, jiraConfig],
      validationSchema: envValidationSchema,
      validationOptions: {
        abortEarly: false,
      },
    }),
    // Global ceiling per IP. Auth routes tighten this further with @Throttle.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    CommonModule,
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    ProjectsModule,
    CaseModule,
    TaskModule,
    SubtaskModule,
    SprintsModule,
    UsersModule,
    DepartmentsModule,
    PrivilegeGroupsModule,
    CustomersModule,
    JiraModule,
    ActivityLogsModule,
    CommentsModule,
    ConfigOptionsModule,
    DashboardModule,
    NotificationModule,
    AttachmentsModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: FriendlyThrottlerGuard }],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
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
import { DashboardModule } from './dashboard/dashboard.module';

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
    DashboardModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

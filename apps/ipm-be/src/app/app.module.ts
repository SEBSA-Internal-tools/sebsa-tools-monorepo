import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@sebsa-pm-tool/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { DepartmentsModule } from './departments/departments.module';
import { PrivilegeGroupsModule } from './privilege-groups/privilege-groups.module';
import { ProjectsModule } from './projects/projects.module';
import { UsersModule } from './users/users.module';
import appConfig from '../config/app.config';
import authConfig from '../config/auth.config';
import databaseConfig from '../config/database.config';
import { envValidationSchema } from '../config/env.validation';
import { TaskModule } from './tasks/task.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, authConfig, databaseConfig],
      validationSchema: envValidationSchema,
      validationOptions: {
        abortEarly: false,
      },
    }),
    PrismaModule,
    AuthModule,
    ProjectsModule,
    TaskModule,
    UsersModule,
    DepartmentsModule,
    PrivilegeGroupsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

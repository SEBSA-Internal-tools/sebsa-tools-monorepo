import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration.ts';
import { validate } from './config/env.validation.ts';
import { HealthModule } from './modules/health/health.module.ts';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard.js';
import { RolesGuard } from './auth/guards/roles.guard.js';
import { CsrfGuard } from './auth/guards/csrf.guard.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { UsersModule } from './users/users.module.js';
import { CustomersModule } from './customers/customers.module.js';
import { TaskTypesModule } from './task-types/task-types.module.js';
import { ChecklistsModule } from './checklists/checklists.module.js';
import { ReviewTasksModule } from './review-tasks/review-tasks.module.js';
import { RolesModule } from './roles/roles.module.js';
import { UserRolesModule } from './user-roles/user-roles.module.js';
import { ChecklistSectionsModule } from './checklist-sections/checklist-sections.module.js';
import { ChecklistQuestionsModule } from './checklist-questions/checklist-questions.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate,
    }),
    HealthModule,
    PrismaModule,
    UsersModule,
    CustomersModule,
    TaskTypesModule,
    ChecklistsModule,
    ReviewTasksModule,
    RolesModule,
    UserRolesModule,
    ChecklistSectionsModule,
    ChecklistQuestionsModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
  ],
})
export class AppModule {}

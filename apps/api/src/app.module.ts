import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration.ts';
import { validate } from './config/env.validation.ts';
import { HealthModule } from './modules/health/health.module.ts';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate,
    }),
    HealthModule,
  ],
})
export class AppModule {}

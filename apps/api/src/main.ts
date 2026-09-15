import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.ts';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.ts';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor.ts';

/**
 * `setGlobalPrefix('api')` is the entire frontend integration contract: the
 * web app's `API_BASE = '/api'` (apps/web/src/lib/apiClient.ts) is hardcoded
 * and stays that way. Nothing about the React app changes when MSW is
 * replaced by this server, because every request it issues already targets
 * `/api/*`.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  const port = config.get<number>('PORT', 3000);
  await app.listen(port);
}

void bootstrap();

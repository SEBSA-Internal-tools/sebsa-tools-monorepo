import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.ts';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.ts';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor.ts';
import { setupSwagger } from './swagger.js';

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
  app.use(cookieParser());
  app.enableCors({
    origin: config.get<string[]>('frontendOrigins', ['http://localhost:5175']),
    credentials: true,
  });
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  setupSwagger(app);

  const port = config.get<number>('port', 3000);
  await app.listen(port);
}

void bootstrap();

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);
  const isProduction = configService.get<string>('app.nodeEnv') === 'production';

  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);

  // Only when actually behind a load balancer. Trusting the header without one
  // lets a client spoof X-Forwarded-For and walk straight past the rate limiter.
  if (configService.get<boolean>('app.trustProxy')) {
    app.set('trust proxy', 1);
  }

  // CSP is disabled outside production because Swagger UI needs inline scripts;
  // Swagger is not mounted in production, so nothing there needs the exemption.
  app.use(
    helmet({
      contentSecurityPolicy: isProduction ? undefined : false,
      hsts: isProduction
        ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
        : false,
    }),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: configService.get<string>('app.corsOrigin'),
  });

  // Lets PrismaService.onModuleDestroy() disconnect gracefully on SIGTERM/SIGINT.
  app.enableShutdownHooks();

  // Dev only: publishing a browsable map of every endpoint and DTO in
  // production is free reconnaissance for an attacker.
  if (!isProduction) {
    const swaggerDocument = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('SEBSA Internal Project Management Tool API')
        .setDescription('See apps/ipm-be/README.md for the backend overview and docs/ for architecture notes.')
        .setVersion('1.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup(`${globalPrefix}/docs`, app, swaggerDocument);
  }

  const port = configService.get<number>('app.port', 3000);
  await app.listen(port);
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`,
  );
  if (!isProduction) {
    Logger.log(`📖 API docs available at: http://localhost:${port}/${globalPrefix}/docs`);
  }
}

bootstrap();

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);

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

  // Interactive API docs, hosted on the same running server — no separate
  // deployment. Paste a JWT from POST /api/auth/login into "Authorize" to
  // call guarded routes directly from the UI.
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

  const port = configService.get<number>('app.port', 3000);
  await app.listen(port);
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`,
  );
  Logger.log(`📖 API docs available at: http://localhost:${port}/${globalPrefix}/docs`);
}

bootstrap();

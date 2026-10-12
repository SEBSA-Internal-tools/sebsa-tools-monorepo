import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../app.module.js';
import { configureApp } from '../app.setup.js';
import { setupSwagger } from '../swagger.js';

let application: Promise<NestExpressApplication> | undefined;

/** Reuse Nest and its Prisma connection on warm invocations; never listen on a port. */
export function getNetlifyApplication(): Promise<NestExpressApplication> {
  application ??= initialise().catch((error: unknown) => {
    application = undefined;
    throw error;
  });
  return application;
}

async function initialise(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  try {
    const config = app.get(ConfigService);
    // A Lambda can freeze as soon as its response is returned. All queued mail
    // is handled by the dedicated scheduler/background function instead.
    config.set('mail.dispatchMode', 'scheduled');
    configureApp(app);
    setupSwagger(app, config.getOrThrow<boolean>('swaggerEnabled'));
    await app.init();
    return app;
  } catch (error) {
    await app.close();
    throw error;
  }
}

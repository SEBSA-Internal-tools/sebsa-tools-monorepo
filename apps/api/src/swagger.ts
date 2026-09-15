import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export const SWAGGER_PATH = 'api/docs';
export const SWAGGER_JSON_PATH = 'api/docs-json';

/** Configures the development-only OpenAPI documentation endpoints. */
export function setupSwagger(app: INestApplication): void {
  if (process.env['NODE_ENV'] === 'production') {
    return;
  }

  const port = process.env['PORT'] ?? '3000';
  const config = new DocumentBuilder()
    .setTitle('SEBSA Code Review Portal API')
    .setDescription('REST API for managing the SEBSA code review workflow.')
    .setVersion('1.0')
    .addServer(`http://localhost:${port}`, 'Local development')
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey, methodKey) =>
      `${controllerKey.replace(/Controller$/, '')}_${methodKey}`,
  });

  SwaggerModule.setup(SWAGGER_PATH, app, document, {
    jsonDocumentUrl: SWAGGER_JSON_PATH,
    customSiteTitle: 'SEBSA API Documentation',
    swaggerOptions: {
      displayRequestDuration: true,
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
      tryItOutEnabled: true,
    },
  });
}

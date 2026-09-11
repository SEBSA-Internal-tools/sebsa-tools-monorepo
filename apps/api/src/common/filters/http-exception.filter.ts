import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { apiErrorSchema } from '@sdp/contracts';

/**
 * Every error response is shaped as `@sdp/contracts`' `ApiError` - the exact
 * envelope `apiClient.ts` already parses on the frontend
 * (`apiErrorSchema.safeParse(payload)` in `toApiError()`), matching what the
 * MSW handlers this server replaces already produce. One shared schema is
 * what keeps error handling unchanged in the UI once requests hit a real
 * server instead of the mock worker.
 *
 * Parses through `apiErrorSchema` rather than just typing the payload as
 * `ApiError`: a type annotation is erased at compile time and proves
 * nothing at runtime, but `@sdp/contracts` ships raw TypeScript with no
 * build step (see the package's `package.json`), so this filter is the
 * concrete proof that apps/api's bundled build actually resolves and
 * inlines it correctly, not just typechecks against it.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const body = exception instanceof HttpException ? exception.getResponse() : undefined;
    const message =
      typeof body === 'string'
        ? body
        : typeof body === 'object' && body !== null && 'message' in body
          ? String(body.message)
          : 'Internal server error';

    const payload = apiErrorSchema.parse({
      statusCode: status,
      code: exception instanceof HttpException ? exception.name : 'INTERNAL_ERROR',
      message,
    });

    response.status(status).json(payload);
  }
}

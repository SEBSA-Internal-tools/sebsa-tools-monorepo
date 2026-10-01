import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiException, type ApiErrorResponse } from '../api-error.js';

/**
 * Converts every thrown value into the public API error envelope. Unknown
 * errors deliberately lose their original message so database, driver, and
 * stack-trace details can never cross the HTTP boundary.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const { status, code, message, details } = this.toPublicError(exception);
    const payload: ApiErrorResponse = {
      code,
      message,
      details,
      timestamp: new Date().toISOString(),
    };

    response.status(status).json(payload);
  }

  private toPublicError(exception: unknown): {
    status: number;
    code: string;
    message: string;
    details: unknown[];
  } {
    if (exception instanceof ApiException) {
      return {
        status: exception.getStatus(),
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }

    if (!(exception instanceof HttpException)) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        code: 'INTERNAL_ERROR',
        message: 'An unexpected server error occurred',
        details: [],
      };
    }

    const status = exception.getStatus();
    const body = exception.getResponse();
    const rawMessage =
      typeof body === 'object' && body !== null && 'message' in body ? body.message : body;
    const validationDetails = Array.isArray(rawMessage) ? rawMessage.map(String) : [];
    const message =
      validationDetails.length > 0
        ? 'Validation failed'
        : typeof rawMessage === 'string'
          ? rawMessage
          : 'Request failed';

    const codeByStatus: Partial<Record<number, string>> = {
      [HttpStatus.BAD_REQUEST]: 'VALIDATION_FAILED',
      [HttpStatus.UNAUTHORIZED]: 'AUTH_REQUIRED',
      [HttpStatus.FORBIDDEN]: 'RESOURCE_FORBIDDEN',
      [HttpStatus.NOT_FOUND]: 'RESOURCE_NOT_FOUND',
      [HttpStatus.CONFLICT]: 'VERSION_CONFLICT',
    };
    const isServerError = status >= Number(HttpStatus.INTERNAL_SERVER_ERROR);

    return {
      status: isServerError ? HttpStatus.INTERNAL_SERVER_ERROR : status,
      code: codeByStatus[status] ?? 'INTERNAL_ERROR',
      message: isServerError ? 'An unexpected server error occurred' : message,
      details: validationDetails,
    };
  }
}

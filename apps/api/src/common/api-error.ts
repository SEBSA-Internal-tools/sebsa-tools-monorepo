import { HttpException, HttpStatus } from '@nestjs/common';

export const ERROR_HTTP_STATUS = {
  VALIDATION_FAILED: HttpStatus.BAD_REQUEST,
  AUTH_REQUIRED: HttpStatus.UNAUTHORIZED,
  RESOURCE_FORBIDDEN: HttpStatus.FORBIDDEN,
  TASK_NOT_FOUND: HttpStatus.NOT_FOUND,
  TASK_ALREADY_CLAIMED: HttpStatus.CONFLICT,
  VERSION_CONFLICT: HttpStatus.CONFLICT,
  IMMUTABLE_TASK_IDENTITY: HttpStatus.CONFLICT,
  INVALID_STATE_TRANSITION: HttpStatus.CONFLICT,
  CHECKLIST_INCOMPLETE: HttpStatus.CONFLICT,
  RESPONSES_INCOMPLETE: HttpStatus.UNPROCESSABLE_ENTITY,
  REVIEW_INCOMPLETE: HttpStatus.UNPROCESSABLE_ENTITY,
  APPROVE_BLOCKED: HttpStatus.UNPROCESSABLE_ENTITY,
  UNRESOLVED_RESPONSES: HttpStatus.UNPROCESSABLE_ENTITY,
  REVIEW_EVIDENCE_REQUIRED: HttpStatus.CONFLICT,
  GRAPH_THROTTLED: HttpStatus.SERVICE_UNAVAILABLE,
  INTERNAL_ERROR: HttpStatus.INTERNAL_SERVER_ERROR,
} as const;

export type ApiErrorCode = keyof typeof ERROR_HTTP_STATUS;

export interface ApiErrorResponse {
  code: string;
  message: string;
  details: unknown[];
  timestamp: string;
}

/** A public, domain-safe error whose HTTP status is fixed by its error code. */
export class ApiException extends HttpException {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly details: unknown[] = [],
  ) {
    super(message, ERROR_HTTP_STATUS[code]);
  }
}

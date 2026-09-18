import { ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler';

/** "in 45 seconds" reads better than "in 45s"; minutes once it is worth rounding. */
function describeWait(seconds: number): string {
  if (seconds <= 1) return 'a moment';
  if (seconds < 60) return `${seconds} seconds`;

  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? 'a minute' : `${minutes} minutes`;
}

/**
 * Replaces the default "ThrottlerException: Too Many Requests" with a message a
 * user can act on, plus the numbers a client needs to render a countdown.
 */
@Injectable()
export class FriendlyThrottlerGuard extends ThrottlerGuard {
  protected async throwThrottlingException(
    _context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    // timeToExpire / timeToBlockExpire are seconds, matching the Retry-After header.
    const secondsLeft = Math.max(
      0,
      Math.ceil(detail.isBlocked ? detail.timeToBlockExpire : detail.timeToExpire),
    );

    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: 'Too Many Requests',
        message: `Too many attempts. Please try again in ${describeWait(secondsLeft)}.`,
        limit: detail.limit,
        remaining: 0,
        retryAfterSeconds: secondsLeft,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

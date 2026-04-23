import {
  CanActivate,
  HttpException,
  HttpStatus,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';

type RateLimitState = {
  count: number;
  resetAt: number;
};

@Injectable()
export class PricingSyncRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(PricingSyncRateLimitGuard.name);
  private readonly states = new Map<string, RateLimitState>();

  canActivate(context: ExecutionContext): boolean {
    const nodeEnv = process.env['NODE_ENV'] ?? 'local';
    if (nodeEnv === 'local') {
      return true;
    }

    const maxRequests = +(process.env['PRICING_SYNC_RATE_LIMIT_MAX'] ?? '5');
    const windowMs = +(
      process.env['PRICING_SYNC_RATE_LIMIT_WINDOW_MS'] ?? '900000'
    );

    const request = context.switchToHttp().getRequest<{
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
    }>();
    const clientKey = this.getClientKey(request);
    const now = Date.now();

    const state = this.states.get(clientKey);
    if (!state || state.resetAt <= now) {
      this.states.set(clientKey, {
        count: 1,
        resetAt: now + windowMs,
      });
      return true;
    }

    if (state.count >= maxRequests) {
      this.logger.warn(`Pricing sync rate limit exceeded for ${clientKey}`);
      throw new HttpException(
        'Pricing sync rate limit exceeded',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    state.count += 1;
    return true;
  }

  private getClientKey(request: {
    ip?: string;
    headers?: Record<string, string | string[] | undefined>;
  }): string {
    const headerValue =
      request.headers?.['x-api-key'] ?? request.headers?.['X-API-KEY'];
    if (typeof headerValue === 'string' && headerValue.trim().length > 0) {
      return `api-key:${headerValue.trim()}`;
    }

    return `ip:${request.ip ?? 'unknown'}`;
  }
}

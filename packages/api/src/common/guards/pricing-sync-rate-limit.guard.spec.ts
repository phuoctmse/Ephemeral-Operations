import { PricingSyncRateLimitGuard } from './pricing-sync-rate-limit.guard';
import { ExecutionContext } from '@nestjs/common';

describe('PricingSyncRateLimitGuard', () => {
  const createContext = (ip = '127.0.0.1', apiKey?: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          ip,
          headers: apiKey ? { 'x-api-key': apiKey } : {},
        }),
      }),
    }) as unknown as ExecutionContext;

  it('should bypass rate limiting in local env', () => {
    const previousNodeEnv = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'local';

    try {
      const guard = new PricingSyncRateLimitGuard();

      expect(guard.canActivate(createContext())).toBe(true);
      expect(guard.canActivate(createContext())).toBe(true);
    } finally {
      process.env['NODE_ENV'] = previousNodeEnv;
    }
  });

  it('should reject when the limit is exceeded', () => {
    const previousNodeEnv = process.env['NODE_ENV'];
    const previousMax = process.env['PRICING_SYNC_RATE_LIMIT_MAX'];
    const previousWindow = process.env['PRICING_SYNC_RATE_LIMIT_WINDOW_MS'];

    process.env['NODE_ENV'] = 'production';
    process.env['PRICING_SYNC_RATE_LIMIT_MAX'] = '2';
    process.env['PRICING_SYNC_RATE_LIMIT_WINDOW_MS'] = '60000';

    try {
      const guard = new PricingSyncRateLimitGuard();

      expect(guard.canActivate(createContext('10.0.0.1', 'secret-key'))).toBe(
        true,
      );
      expect(guard.canActivate(createContext('10.0.0.1', 'secret-key'))).toBe(
        true,
      );
      expect(() =>
        guard.canActivate(createContext('10.0.0.1', 'secret-key')),
      ).toThrow('Pricing sync rate limit exceeded');
    } finally {
      process.env['NODE_ENV'] = previousNodeEnv;
      process.env['PRICING_SYNC_RATE_LIMIT_MAX'] = previousMax;
      process.env['PRICING_SYNC_RATE_LIMIT_WINDOW_MS'] = previousWindow;
    }
  });
});

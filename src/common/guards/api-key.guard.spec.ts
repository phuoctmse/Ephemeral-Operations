import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';

describe('ApiKeyGuard', () => {
  const createContext = (headers: Record<string, unknown>) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ headers }),
      }),
    }) as never;

  it('should allow requests with a valid API key', () => {
    const guard = new ApiKeyGuard({
      get: () => 'secret-key',
    } as unknown as ConfigService);

    expect(
      guard.canActivate(createContext({ 'x-api-key': 'secret-key' })),
    ).toBe(true);
  });

  it('should reject requests with a missing API key', () => {
    const guard = new ApiKeyGuard({
      get: () => 'secret-key',
    } as unknown as ConfigService);

    expect(() => guard.canActivate(createContext({}))).toThrow(
      UnauthorizedException,
    );
  });

  it('should reject requests with an invalid API key', () => {
    const guard = new ApiKeyGuard({
      get: () => 'secret-key',
    } as unknown as ConfigService);

    expect(() =>
      guard.canActivate(createContext({ 'x-api-key': 'wrong-key' })),
    ).toThrow(UnauthorizedException);
  });
});

import { UnauthorizedException } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';
import type { AppConfig } from '../config/app.config';

describe('ApiKeyGuard', () => {
  const createContext = (headers: Record<string, unknown>) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ headers }),
      }),
    }) as never;

  const createMockConfig = (apiKey: string): AppConfig => ({
    nodeEnv: 'test',
    ollamaBaseUrl: 'http://localhost:11434',
    ollamaModel: 'llama3.2',
    ollamaFallbackModel: 'fallback',
    ollamaTimeoutMs: 15000,
    awsRegion: 'us-east-1',
    awsAccessKeyId: 'test-key',
    awsSecretAccessKey: 'test-secret',
    awsEndpoint: '',
    apiKey,
    pricingSyncRateLimitMax: 5,
    pricingSyncRateLimitWindowMs: 900000,
    maxConcurrentEnvs: 2,
    maxTtlHours: 2,
  });

  it('should allow requests with a valid API key', () => {
    const guard = new ApiKeyGuard(createMockConfig('secret-key'));

    expect(
      guard.canActivate(createContext({ 'x-api-key': 'secret-key' })),
    ).toBe(true);
  });

  it('should reject requests with a missing API key', () => {
    const guard = new ApiKeyGuard(createMockConfig('secret-key'));

    expect(() => guard.canActivate(createContext({}))).toThrow(
      UnauthorizedException,
    );
  });

  it('should reject requests with an invalid API key', () => {
    const guard = new ApiKeyGuard(createMockConfig('secret-key'));

    expect(() =>
      guard.canActivate(createContext({ 'x-api-key': 'wrong-key' })),
    ).toThrow(UnauthorizedException);
  });
});

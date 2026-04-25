import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OllamaService } from './ollama.service';
import { PricingService } from '../pricing/pricing.service';
import { PolicyRetrieverService } from '../policy/policy-retriever.service';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';

const mockDecision = {
  decision: 'APPROVE',
  reasoning: 'Low-cost test environment, safe to provision.',
  config: { instanceType: 't3.micro', ttlHours: 1, region: 'us-east-1' },
  costAnalysis: { estimatedHourly: 0.0104, totalExpected: 0.0104 },
};

const okResponse = () =>
  new Response(
    JSON.stringify({ message: { content: JSON.stringify(mockDecision) } }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );

describe('OllamaService', () => {
  let service: OllamaService;
  let mockFetch: jest.MockedFunction<typeof fetch>;

  const buildModule = async (
    configOverrides: Record<string, string | number> = {},
  ) => {
    const module = await Test.createTestingModule({
      providers: [
        OllamaService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, defaultValue?: string | number) => {
              const config: Record<string, string | number> = {
                'app.ollamaBaseUrl': 'http://localhost:11434',
                'app.ollamaModel': 'llama3.2',
                'app.ollamaFallbackModel': '',
                'app.ollamaTimeoutMs': 15000,
                'app.awsRegion': 'us-east-1',
                ...configOverrides,
              };
              return config[key] ?? defaultValue;
            },
          },
        },
        {
          provide: PricingService,
          useValue: {
            getHourlyCost: jest.fn(() => Promise.resolve(0.0104)),
            getPricingTableForPrompt: jest.fn(() =>
              Promise.resolve(
                '- t3.micro: $0.0104/hour\n- t4g.nano: $0.0042/hour',
              ),
            ),
          },
        },
        {
          provide: PolicyRetrieverService,
          useValue: {
            buildContextSnippet: jest.fn(() => ''),
          },
        },
      ],
    }).compile();

    return module.get<OllamaService>(OllamaService);
  };

  beforeEach(async () => {
    mockFetch = jest.fn();
    global.fetch = mockFetch;
    service = await buildModule();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('analyzePrompt', () => {
    it('should return a valid LlmAnalysisResult on successful LLM response', async () => {
      mockFetch.mockResolvedValue(okResponse());

      const result = await service.analyzePrompt(
        'I need a test server',
        't3.micro',
        1,
      );

      expect(result.decision.decision).toBe('APPROVE');
      expect(result.decision.reasoning).toBeDefined();
      expect(result.decision.config?.instanceType).toBe('t3.micro');
      expect(result.decision.costAnalysis).toBeDefined();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.fallbackUsed).toBe(false);
    });

    it('should fallback to REJECT when Ollama is unavailable', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      const result = await service.analyzePrompt(
        'I need a test server',
        't3.micro',
        1,
      );

      expect(result.decision.decision).toBe('REJECT');
      expect(result.decision.reasoning).toContain('LLM unavailable');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle non-OK HTTP response and fail closed', async () => {
      mockFetch.mockResolvedValue(
        new Response('Internal Server Error', {
          status: 500,
          headers: { 'Content-Type': 'text/plain' },
        }),
      );

      const result = await service.analyzePrompt(
        'I need a test server',
        't4g.nano',
        0.5,
      );

      expect(result.decision.decision).toBe('REJECT');
      expect(result.decision.reasoning).toContain('LLM unavailable');
    });

    it('should validate LLM response with Zod and fail closed on invalid schema', async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            message: { content: JSON.stringify({ invalid: 'data' }) },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const result = await service.analyzePrompt('test', 't3.micro', 1);

      expect(result.decision.decision).toBe('REJECT');
      expect(result.decision.reasoning).toContain('LLM unavailable');
    });

    it('should use fallback model when primary model times out', async () => {
      service = await buildModule({
        'app.ollamaModel': 'primary-model',
        'app.ollamaFallbackModel': 'fallback-model',
        'app.ollamaTimeoutMs': 100,
      });

      // Primary times out, fallback succeeds
      mockFetch
        .mockImplementationOnce(
          () =>
            new Promise<Response>((_, reject) => {
              setTimeout(() => {
                const err = new Error('The operation was aborted');
                err.name = 'AbortError';
                reject(err);
              }, 200);
            }),
        )
        .mockResolvedValueOnce(okResponse());

      const result = await service.analyzePrompt(
        'I need a test server',
        't3.micro',
        1,
      );

      expect(result.decision.decision).toBe('APPROVE');
      expect(result.fallbackUsed).toBe(true);
      expect(result.decision.fallbackUsed).toBe(true);
    });

    it('should fail closed when both primary and fallback models fail', async () => {
      service = await buildModule({
        'app.ollamaModel': 'primary-model',
        'app.ollamaFallbackModel': 'fallback-model',
      });

      mockFetch.mockRejectedValue(new Error('Connection refused'));

      const result = await service.analyzePrompt(
        'I need a test server',
        't3.micro',
        1,
      );

      expect(result.decision.decision).toBe('REJECT');
      expect(result.decision.reasoning).toContain('LLM unavailable');
    });

    it('should inject costAnalysis when LLM omits it', async () => {
      const decisionWithoutCost = {
        decision: 'APPROVE',
        reasoning: 'OK',
        config: { instanceType: 't3.micro', ttlHours: 1, region: 'us-east-1' },
      };
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            message: { content: JSON.stringify(decisionWithoutCost) },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const result = await service.analyzePrompt('test', 't3.micro', 1);

      expect(result.decision.costAnalysis).toBeDefined();
      expect(result.decision.costAnalysis?.estimatedHourly).toBe(0.0104);
    });
  });

  describe('isAvailable', () => {
    it('should return true when Ollama is reachable', async () => {
      mockFetch.mockResolvedValue(new Response(null, { status: 200 }));
      await expect(service.isAvailable()).resolves.toBe(true);
    });

    it('should return false when Ollama is unreachable', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));
      await expect(service.isAvailable()).resolves.toBe(false);
    });
  });
});

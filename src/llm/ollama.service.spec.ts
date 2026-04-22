import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OllamaService } from './ollama.service';
import { AgentDecisionSchema } from '../common/schemas/agent-decision.schema';

describe('OllamaService', () => {
  let service: OllamaService;
  let mockFetch: jest.Mock;

  beforeEach(async () => {
    mockFetch = jest.fn();
    global.fetch = mockFetch;

    const module = await Test.createTestingModule({
      providers: [
        OllamaService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, defaultValue?: string) => {
              const config: Record<string, string> = {
                'app.ollamaBaseUrl': 'http://localhost:11434',
                'app.ollamaModel': 'llama3.2',
              };
              return config[key] ?? defaultValue;
            },
          },
        },
      ],
    }).compile();

    service = module.get<OllamaService>(OllamaService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('analyzePrompt', () => {
    it('should return a valid AgentDecision on successful LLM response', async () => {
      const mockDecision = {
        decision: 'APPROVE',
        reasoning: 'Low-cost test environment, safe to provision.',
        config: {
          instanceType: 't3.micro',
          ttlHours: 1,
          region: 'us-east-1',
        },
        costAnalysis: {
          estimatedHourly: 0.0104,
          totalExpected: 0.0104,
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          message: { content: JSON.stringify(mockDecision) },
        }),
      });

      const result = await service.analyzePrompt('I need a test server', 't3.micro', 1);

      expect(result.decision).toBe('APPROVE');
      expect(result.reasoning).toBeDefined();
      expect(result.config?.instanceType).toBe('t3.micro');
      expect(result.costAnalysis.estimatedHourly).toBe(0.0104);
    });

    it('should fallback to auto-approve when Ollama is unavailable', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      const result = await service.analyzePrompt('I need a test server', 't3.micro', 1);

      expect(result.decision).toBe('APPROVE');
      expect(result.reasoning).toContain('LLM unavailable');
      expect(result.config?.instanceType).toBe('t3.micro');
    });

    it('should handle non-OK HTTP response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      const result = await service.analyzePrompt('I need a test server', 't4g.nano', 0.5);

      expect(result.decision).toBe('APPROVE');
      expect(result.reasoning).toContain('LLM unavailable');
    });

    it('should validate LLM response with Zod', async () => {
      // Return invalid JSON that doesn't match schema
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          message: { content: JSON.stringify({ invalid: 'data' }) },
        }),
      });

      const result = await service.analyzePrompt('test', 't3.micro', 1);

      // Should fallback because Zod validation will fail
      expect(result.decision).toBe('APPROVE');
      expect(result.reasoning).toContain('LLM unavailable');
    });
  });

  describe('isAvailable', () => {
    it('should return true when Ollama is reachable', async () => {
      mockFetch.mockResolvedValue({ ok: true });
      await expect(service.isAvailable()).resolves.toBe(true);
    });

    it('should return false when Ollama is unreachable', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));
      await expect(service.isAvailable()).resolves.toBe(false);
    });
  });
});

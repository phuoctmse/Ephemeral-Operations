import { Test } from '@nestjs/testing';
import { GuardrailsService } from './guardrails.service';
import { SandboxEnvRepository } from '../sandbox-env/sandbox-env.repository';
import {
  UnauthorizedInstanceTypeError,
  UnrecognizedInstanceTypeError,
  UnresolvableTtlError,
  ConcurrencyLimitError,
  TtlExceededError,
} from '../common/exceptions/finops.exceptions';
import { type ExtractedIntent } from '../common/schemas/extracted-intent.schema';
import appConfig from '../common/config/app.config';

describe('GuardrailsService', () => {
  let service: GuardrailsService;
  let mockRepo: { countRunning: jest.Mock };

  beforeEach(async () => {
    mockRepo = { countRunning: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        GuardrailsService,
        {
          provide: appConfig.KEY,
          useValue: {
            maxConcurrentEnvs: 2,
            maxTtlHours: 2,
          },
        },
        {
          provide: SandboxEnvRepository,
          useValue: mockRepo,
        },
      ],
    }).compile();

    service = module.get<GuardrailsService>(GuardrailsService);
  });

  describe('validateInstanceType', () => {
    it('should allow t3.micro', () => {
      expect(() => service.validateInstanceType('t3.micro')).not.toThrow();
    });

    it('should allow t4g.nano', () => {
      expect(() => service.validateInstanceType('t4g.nano')).not.toThrow();
    });

    it('should reject m5.large', () => {
      expect(() => service.validateInstanceType('m5.large')).toThrow(
        UnauthorizedInstanceTypeError,
      );
      expect(() => service.validateInstanceType('m5.large')).toThrow(
        'not allowed',
      );
    });

    it('should reject p3.8xlarge', () => {
      expect(() => service.validateInstanceType('p3.8xlarge')).toThrow(
        UnauthorizedInstanceTypeError,
      );
    });
  });

  describe('validateConcurrency', () => {
    it('should pass when under the limit', async () => {
      mockRepo.countRunning.mockResolvedValue(1);
      await expect(service.validateConcurrency()).resolves.not.toThrow();
    });

    it('should throw when at the limit', async () => {
      mockRepo.countRunning.mockResolvedValue(2);
      await expect(service.validateConcurrency()).rejects.toThrow(
        ConcurrencyLimitError,
      );
    });

    it('should throw when over the limit', async () => {
      mockRepo.countRunning.mockResolvedValue(5);
      await expect(service.validateConcurrency()).rejects.toThrow(
        ConcurrencyLimitError,
      );
    });
  });

  describe('enforceTtl', () => {
    it('should allow TTL within limit', () => {
      expect(service.enforceTtl(1)).toBe(1);
    });

    it('should throw when TTL exceeds max', () => {
      expect(() => service.enforceTtl(5)).toThrow(TtlExceededError);
    });

    it('should allow exactly the max TTL', () => {
      expect(service.enforceTtl(2)).toBe(2);
    });
  });

  describe('overrideTtl', () => {
    it('should return TTL as-is when within limit', () => {
      expect(service.overrideTtl(1)).toBe(1);
    });

    it('should cap TTL to max when exceeding', () => {
      expect(service.overrideTtl(5)).toBe(2);
    });
  });

  describe('validateIntent', () => {
    const validIntent: ExtractedIntent = {
      instanceType: 't3.micro',
      ttlHours: 1,
      confidence: 'high',
      rawRequest: 'Linux test server for 1 hour',
    };

    it('should pass for a valid intent', () => {
      expect(() => service.validateIntent(validIntent)).not.toThrow();
    });

    it('should throw UnrecognizedInstanceTypeError when instanceType is null', () => {
      const intent: ExtractedIntent = {
        ...validIntent,
        instanceType: null,
        rawRequest: 'nvidia rtx5900 GPU server',
      };
      expect(() => service.validateIntent(intent)).toThrow(
        UnrecognizedInstanceTypeError,
      );
      expect(() => service.validateIntent(intent)).toThrow(
        'nvidia rtx5900 GPU server',
      );
    });

    it('should throw UnresolvableTtlError when ttlHours is null', () => {
      const intent: ExtractedIntent = {
        ...validIntent,
        ttlHours: null,
      };
      expect(() => service.validateIntent(intent)).toThrow(
        UnresolvableTtlError,
      );
    });

    it('should throw UnauthorizedInstanceTypeError for disallowed type via validateInstanceType', () => {
      // This path is hit if LLM somehow returns a non-null but disallowed type
      // (schema constrains to t3.micro|t4g.nano|null, so this is a safety net)
      const intent = {
        ...validIntent,
        instanceType: 'm5.large' as unknown as 't3.micro',
      };
      expect(() => service.validateIntent(intent)).toThrow(
        UnauthorizedInstanceTypeError,
      );
    });

    it('should throw TtlExceededError when ttlHours exceeds max', () => {
      const intent: ExtractedIntent = {
        ...validIntent,
        ttlHours: 10,
      };
      expect(() => service.validateIntent(intent)).toThrow(TtlExceededError);
    });

    it('should pass for t4g.nano with valid TTL', () => {
      const intent: ExtractedIntent = {
        instanceType: 't4g.nano',
        ttlHours: 0.5,
        confidence: 'high',
        rawRequest: 'nano instance for 30 minutes',
      };
      expect(() => service.validateIntent(intent)).not.toThrow();
    });
  });
});

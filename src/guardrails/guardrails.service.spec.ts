import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GuardrailsService } from './guardrails.service';
import { SandboxEnvRepository } from '../sandbox-env/sandbox-env.repository';
import {
  UnauthorizedInstanceTypeError,
  ConcurrencyLimitError,
  TtlExceededError,
} from '../common/exceptions/finops.exceptions';

describe('GuardrailsService', () => {
  let service: GuardrailsService;
  let mockRepo: { countRunning: jest.Mock };

  beforeEach(async () => {
    mockRepo = { countRunning: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        GuardrailsService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, defaultValue?: number) => {
              const config: Record<string, number> = {
                'app.maxConcurrentEnvs': 2,
                'app.maxTtlHours': 2,
              };
              return config[key] ?? defaultValue;
            },
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
});

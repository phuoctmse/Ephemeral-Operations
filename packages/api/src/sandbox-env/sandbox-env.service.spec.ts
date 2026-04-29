import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { SandboxEnvService } from './sandbox-env.service';
import { SandboxEnvRepository } from './sandbox-env.repository';
import { AwsEc2Service } from '../aws-ec2/aws-ec2.service';
import { OllamaService } from '../llm/ollama.service';
import { GuardrailsService } from '../guardrails/guardrails.service';
import { ActionLogRepository } from '../action-log/action-log.repository';
import { UnauthorizedInstanceTypeError } from '../common/exceptions/finops.exceptions';
import { PricingService } from '../pricing/pricing.service';
import { PrismaService } from '../prisma/prisma.service';
import appConfig from '../common/config/app.config';

const approveResult = {
  decision: {
    decision: 'APPROVE' as const,
    reasoning: 'Safe to provision.',
    config: {
      instanceType: 't3.micro' as const,
      ttlHours: 1,
      region: 'us-east-1',
    },
    costAnalysis: { estimatedHourly: 0.0104, totalExpected: 0.0104 },
    fallbackUsed: false,
  },
  durationMs: 800,
  fallbackUsed: false,
};

const rejectResult = {
  decision: {
    decision: 'REJECT' as const,
    reasoning: 'Request too expensive for budget.',
    costAnalysis: { estimatedHourly: 0, totalExpected: 0 },
    fallbackUsed: false,
  },
  durationMs: 600,
  fallbackUsed: false,
};

describe('SandboxEnvService', () => {
  let service: SandboxEnvService;
  let mockRepo: Record<string, jest.Mock>;
  let mockEc2: Record<string, jest.Mock>;
  let mockLlm: Record<string, jest.Mock>;
  let mockGuardrails: Record<string, jest.Mock>;
  let mockActionLogRepo: Record<string, jest.Mock>;
  let mockPricing: Record<string, jest.Mock>;
  let mockPrisma: { $transaction: jest.Mock };

  beforeEach(async () => {
    mockRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      updateStatus: jest.fn(),
      updateToFailed: jest.fn(),
      countRunning: jest.fn(),
    };
    mockEc2 = {
      runInstance: jest.fn(),
      terminateInstance: jest.fn(),
      createTags: jest.fn(),
    };
    mockLlm = { analyzePrompt: jest.fn() };
    mockGuardrails = {
      validateInstanceType: jest.fn(),
      validateConcurrency: jest.fn(),
    };
    mockActionLogRepo = { create: jest.fn() };
    mockPricing = { getHourlyCost: jest.fn() };

    // Default: transaction succeeds with count=0 and creates env
    mockPrisma = {
      $transaction: jest
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            sandboxEnv: {
              count: jest.fn().mockResolvedValue(0),
              create: jest.fn().mockResolvedValue({
                id: 'env-1',
                prompt: 'I need a test server',
                instanceType: 't3.micro',
                status: 'CREATING',
                hourlyCost: 0.0104,
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + 3600000),
              }),
            },
          } as unknown;
          return fn(tx);
        }),
    };

    const module = await Test.createTestingModule({
      providers: [
        SandboxEnvService,
        { provide: SandboxEnvRepository, useValue: mockRepo },
        { provide: AwsEc2Service, useValue: mockEc2 },
        { provide: OllamaService, useValue: mockLlm },
        { provide: GuardrailsService, useValue: mockGuardrails },
        { provide: ActionLogRepository, useValue: mockActionLogRepo },
        { provide: PricingService, useValue: mockPricing },
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: appConfig.KEY,
          useValue: {
            maxTtlHours: 2,
            awsRegion: 'us-east-1',
            maxConcurrentEnvs: 2,
          },
        },
      ],
    }).compile();

    service = module.get<SandboxEnvService>(SandboxEnvService);
  });

  describe('provision', () => {
    const baseDto = { prompt: 'I need a test server' };

    it('should create a sandbox environment end-to-end', async () => {
      mockGuardrails.validateInstanceType.mockReturnValue(undefined);
      mockPricing.getHourlyCost.mockResolvedValue(0.0104);
      mockLlm.analyzePrompt.mockResolvedValue(approveResult);
      mockEc2.runInstance.mockResolvedValue('i-0abc123');
      mockEc2.createTags.mockResolvedValue(undefined);
      mockRepo.updateStatus.mockResolvedValue({
        id: 'env-1',
        status: 'RUNNING',
        resourceId: 'i-0abc123',
      });
      mockActionLogRepo.create.mockResolvedValue({});

      await service.provision(baseDto);

      expect(mockGuardrails.validateInstanceType).toHaveBeenCalledWith(
        't3.micro',
      );
      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockLlm.analyzePrompt).toHaveBeenCalled();
      expect(mockEc2.runInstance).toHaveBeenCalledWith('t3.micro');
      expect(mockActionLogRepo.create).toHaveBeenCalledTimes(2);
    });

    it('should fail and log when guardrails reject the instance type', async () => {
      mockGuardrails.validateInstanceType.mockImplementation(() => {
        throw new UnauthorizedInstanceTypeError('m5.large');
      });
      mockPricing.getHourlyCost.mockResolvedValue(0.0104);
      mockRepo.create.mockResolvedValue({
        id: 'env-blocked',
        prompt: 'Need a big server',
        instanceType: 'm5.large',
        status: 'CREATING',
        hourlyCost: 0,
        createdAt: new Date(),
        expiresAt: new Date(),
      });
      mockRepo.updateToFailed.mockResolvedValue({});
      mockActionLogRepo.create.mockResolvedValue({});

      await expect(
        service.provision({
          prompt: 'Need a big server',
          instanceType: 'm5.large' as unknown as 't3.micro',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockActionLogRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ toolCalled: 'guardrails_block' }),
      );
    });

    it('should override a policy-compliant LLM reject and still provision', async () => {
      mockGuardrails.validateInstanceType.mockReturnValue(undefined);
      mockPricing.getHourlyCost.mockResolvedValue(0.0104);
      mockLlm.analyzePrompt.mockResolvedValue(rejectResult);
      mockEc2.runInstance.mockResolvedValue('i-0abc123');
      mockEc2.createTags.mockResolvedValue(undefined);
      mockRepo.updateStatus.mockResolvedValue({
        id: 'env-1',
        status: 'RUNNING',
        resourceId: 'i-0abc123',
      });
      mockRepo.updateToFailed.mockResolvedValue({});
      mockActionLogRepo.create.mockResolvedValue({});

      await service.provision({
        prompt: 'I need a Linux test server for 1 hour',
        instanceType: 't3.micro',
        ttlHours: 1,
      });

      expect(mockRepo.updateToFailed).not.toHaveBeenCalled();
      expect(mockEc2.runInstance).toHaveBeenCalledWith('t3.micro');
      expect(mockRepo.updateStatus).toHaveBeenCalledWith('env-1', 'RUNNING', {
        resourceId: 'i-0abc123',
      });
      expect(mockActionLogRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          toolCalled: 'log_reasoning',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          agentReasoning: expect.stringContaining('Provision approved.'),
        }),
      );
    });

    it('should rollback on EC2 failure', async () => {
      mockGuardrails.validateInstanceType.mockReturnValue(undefined);
      mockPricing.getHourlyCost.mockResolvedValue(0.0104);
      mockLlm.analyzePrompt.mockResolvedValue(approveResult);
      mockEc2.runInstance.mockRejectedValue(new Error('EC2 unavailable'));
      mockRepo.updateToFailed.mockResolvedValue({});
      mockActionLogRepo.create.mockResolvedValue({});

      await expect(service.provision({ prompt: 'Test' })).rejects.toThrow(
        'Provisioning failed',
      );

      expect(mockRepo.updateToFailed).toHaveBeenCalled();
    });

    it('should log durationMs from LLM result', async () => {
      mockGuardrails.validateInstanceType.mockReturnValue(undefined);
      mockPricing.getHourlyCost.mockResolvedValue(0.0104);
      mockLlm.analyzePrompt.mockResolvedValue({
        ...approveResult,
        durationMs: 1234,
      });
      mockEc2.runInstance.mockResolvedValue('i-0abc123');
      mockEc2.createTags.mockResolvedValue(undefined);
      mockRepo.updateStatus.mockResolvedValue({
        id: 'env-1',
        status: 'RUNNING',
      });
      mockActionLogRepo.create.mockResolvedValue({});

      await service.provision(baseDto);

      expect(mockActionLogRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          toolCalled: 'log_reasoning',
          durationMs: 1234,
        }),
      );
    });

    it('should fallback to static pricing when pricing service fails', async () => {
      mockGuardrails.validateInstanceType.mockReturnValue(undefined);
      mockPricing.getHourlyCost.mockRejectedValue(
        new Error('pricing unavailable'),
      );
      mockLlm.analyzePrompt.mockResolvedValue(approveResult);
      mockEc2.runInstance.mockResolvedValue('i-0abc123');
      mockEc2.createTags.mockResolvedValue(undefined);
      mockRepo.updateStatus.mockResolvedValue({
        id: 'env-1',
        status: 'RUNNING',
      });
      mockActionLogRepo.create.mockResolvedValue({});

      // Should not throw — falls back to PRICING_TABLE
      await expect(service.provision(baseDto)).resolves.toBeDefined();
    });
  });

  describe('terminate', () => {
    it('should terminate an environment and calculate cost', async () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      mockRepo.findById.mockResolvedValue({
        id: 'env-1',
        resourceId: 'i-0abc123',
        createdAt: twoHoursAgo,
        hourlyCost: 0.0104,
      });
      mockEc2.terminateInstance.mockResolvedValue(undefined);
      mockRepo.updateStatus.mockResolvedValue({
        id: 'env-1',
        status: 'DESTROYED',
      });

      await service.terminate('env-1');

      expect(mockEc2.terminateInstance).toHaveBeenCalledWith('i-0abc123');
      expect(mockRepo.updateStatus).toHaveBeenCalledWith(
        'env-1',
        'DESTROYED',
        expect.anything(),
      );
    });

    it('should throw when environment not found', async () => {
      mockRepo.findById.mockResolvedValue(null);
      await expect(service.terminate('nonexistent')).rejects.toThrow(
        'not found',
      );
    });
  });

  describe('findAll', () => {
    it('should return all environments', async () => {
      mockRepo.findAll.mockResolvedValue([{ id: 'env-1' }, { id: 'env-2' }]);
      await expect(service.findAll()).resolves.toHaveLength(2);
    });
  });
});

import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SandboxEnvService } from './sandbox-env.service';
import { SandboxEnvRepository } from './sandbox-env.repository';
import { AwsEc2Service } from '../aws-ec2/aws-ec2.service';
import { OllamaService } from '../llm/ollama.service';
import { GuardrailsService } from '../guardrails/guardrails.service';
import { ActionLogRepository } from '../action-log/action-log.repository';
import { UnauthorizedInstanceTypeError } from '../common/exceptions/finops.exceptions';

describe('SandboxEnvService', () => {
  let service: SandboxEnvService;
  let mockRepo: Record<string, jest.Mock>;
  let mockEc2: Record<string, jest.Mock>;
  let mockLlm: Record<string, jest.Mock>;
  let mockGuardrails: Record<string, jest.Mock>;
  let mockActionLogRepo: Record<string, jest.Mock>;

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

    const module = await Test.createTestingModule({
      providers: [
        SandboxEnvService,
        { provide: SandboxEnvRepository, useValue: mockRepo },
        { provide: AwsEc2Service, useValue: mockEc2 },
        { provide: OllamaService, useValue: mockLlm },
        { provide: GuardrailsService, useValue: mockGuardrails },
        { provide: ActionLogRepository, useValue: mockActionLogRepo },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, defaultValue?: number) => {
              const config: Record<string, number> = {
                'app.maxTtlHours': 2,
              };
              return config[key] ?? defaultValue;
            },
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
      mockGuardrails.validateConcurrency.mockResolvedValue(undefined);
      mockRepo.create.mockResolvedValue({
        id: 'env-1',
        prompt: baseDto.prompt,
        instanceType: 't3.micro',
        status: 'CREATING',
        hourlyCost: 0.0104,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
      });
      mockLlm.analyzePrompt.mockResolvedValue({
        decision: 'APPROVE',
        reasoning: 'Safe to provision.',
        config: { instanceType: 't3.micro', ttlHours: 1, region: 'us-east-1' },
        costAnalysis: { estimatedHourly: 0.0104, totalExpected: 0.0104 },
      });
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
      expect(mockGuardrails.validateConcurrency).toHaveBeenCalled();
      expect(mockRepo.create).toHaveBeenCalled();
      expect(mockLlm.analyzePrompt).toHaveBeenCalled();
      expect(mockEc2.runInstance).toHaveBeenCalledWith('t3.micro');
      expect(mockActionLogRepo.create).toHaveBeenCalledTimes(2); // reasoning + provisioning
    });

    it('should fail when guardrails reject the instance type', async () => {
      mockGuardrails.validateInstanceType.mockImplementation(() => {
        throw new UnauthorizedInstanceTypeError('m5.large');
      });

      await expect(
        service.provision({
          prompt: 'Need a big server',
          instanceType: 'm5.large' as unknown as 't3.micro',
        }),
      ).rejects.toThrow(UnauthorizedInstanceTypeError);
    });

    it('should mark env as FAILED when LLM rejects', async () => {
      mockGuardrails.validateInstanceType.mockReturnValue(undefined);
      mockGuardrails.validateConcurrency.mockResolvedValue(undefined);
      mockRepo.create.mockResolvedValue({
        id: 'env-reject',
        prompt: 'Too expensive request',
        instanceType: 't3.micro',
        status: 'CREATING',
        hourlyCost: 0.0104,
        createdAt: new Date(),
        expiresAt: new Date(),
      });
      mockLlm.analyzePrompt.mockResolvedValue({
        decision: 'REJECT',
        reasoning: 'Request too expensive for budget.',
        costAnalysis: { estimatedHourly: 0, totalExpected: 0 },
      });
      mockRepo.updateToFailed.mockResolvedValue({});
      mockActionLogRepo.create.mockResolvedValue({});

      await service.provision({
        prompt: 'Too expensive request',
      });

      expect(mockRepo.updateToFailed).toHaveBeenCalledWith(
        'env-reject',
        'Request too expensive for budget.',
      );
    });

    it('should rollback on EC2 failure', async () => {
      mockGuardrails.validateInstanceType.mockReturnValue(undefined);
      mockGuardrails.validateConcurrency.mockResolvedValue(undefined);
      mockRepo.create.mockResolvedValue({
        id: 'env-fail',
        prompt: 'Test',
        instanceType: 't3.micro',
        status: 'CREATING',
        hourlyCost: 0.0104,
        createdAt: new Date(),
        expiresAt: new Date(),
      });
      mockLlm.analyzePrompt.mockResolvedValue({
        decision: 'APPROVE',
        reasoning: 'OK',
        config: { instanceType: 't3.micro', ttlHours: 1, region: 'us-east-1' },
        costAnalysis: { estimatedHourly: 0.0104, totalExpected: 0.0104 },
      });
      mockEc2.runInstance.mockRejectedValue(new Error('EC2 unavailable'));
      mockRepo.updateToFailed.mockResolvedValue({});
      mockActionLogRepo.create.mockResolvedValue({});

      await expect(service.provision({ prompt: 'Test' })).rejects.toThrow(
        'Provisioning failed',
      );

      expect(mockRepo.updateToFailed).toHaveBeenCalled();
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
        expect.objectContaining({}),
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

      const result = await service.findAll();
      expect(result).toHaveLength(2);
    });
  });
});

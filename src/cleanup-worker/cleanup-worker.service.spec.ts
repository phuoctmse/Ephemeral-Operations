import { Test } from '@nestjs/testing';
import { CleanupWorkerService } from './cleanup-worker.service';
import { SandboxEnvRepository } from '../sandbox-env/sandbox-env.repository';
import { AwsEc2Service } from '../aws-ec2/aws-ec2.service';
import { ActionLogRepository } from '../action-log/action-log.repository';

describe('CleanupWorkerService', () => {
  let service: CleanupWorkerService;
  let mockSandboxEnvRepo: {
    findExpiredRunning: jest.Mock;
    updateStatus: jest.Mock;
  };
  let mockEc2Service: { terminateInstance: jest.Mock };
  let mockActionLogRepo: { create: jest.Mock };

  beforeEach(async () => {
    mockSandboxEnvRepo = {
      findExpiredRunning: jest.fn(),
      updateStatus: jest.fn(),
    };
    mockEc2Service = { terminateInstance: jest.fn() };
    mockActionLogRepo = { create: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        CleanupWorkerService,
        { provide: SandboxEnvRepository, useValue: mockSandboxEnvRepo },
        { provide: AwsEc2Service, useValue: mockEc2Service },
        { provide: ActionLogRepository, useValue: mockActionLogRepo },
      ],
    }).compile();

    service = module.get<CleanupWorkerService>(CleanupWorkerService);
  });

  describe('handleCron', () => {
    it('should do nothing when no expired environments exist', async () => {
      mockSandboxEnvRepo.findExpiredRunning.mockResolvedValue([]);

      await service.handleCron();

      expect(mockEc2Service.terminateInstance).not.toHaveBeenCalled();
      expect(mockSandboxEnvRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('should terminate expired environments and update status', async () => {
      const expiredEnv = {
        id: 'env-1',
        resourceId: 'i-0abc123',
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        hourlyCost: 0.0104,
        expiresAt: new Date(Date.now() - 1000), // expired
      };

      mockSandboxEnvRepo.findExpiredRunning.mockResolvedValue([expiredEnv]);
      mockEc2Service.terminateInstance.mockResolvedValue(undefined);
      mockSandboxEnvRepo.updateStatus.mockResolvedValue({});
      mockActionLogRepo.create.mockResolvedValue({});

      await service.handleCron();

      expect(mockEc2Service.terminateInstance).toHaveBeenCalledWith('i-0abc123');
      expect(mockSandboxEnvRepo.updateStatus).toHaveBeenCalledWith(
        'env-1',
        'DESTROYED',
        expect.objectContaining({ costIncurred: expect.any(Number) }),
      );
      expect(mockActionLogRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          envId: 'env-1',
          toolCalled: 'cleanup_worker',
        }),
      );
    });

    it('should continue processing other envs when one fails', async () => {
      const env1 = {
        id: 'env-1',
        resourceId: 'i-fail',
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        hourlyCost: 0.0104,
        expiresAt: new Date(Date.now() - 1000),
      };
      const env2 = {
        id: 'env-2',
        resourceId: 'i-success',
        createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
        hourlyCost: 0.0042,
        expiresAt: new Date(Date.now() - 1000),
      };

      mockSandboxEnvRepo.findExpiredRunning.mockResolvedValue([env1, env2]);
      mockEc2Service.terminateInstance
        .mockRejectedValueOnce(new Error('Terminate failed'))
        .mockResolvedValueOnce(undefined);
      mockSandboxEnvRepo.updateStatus.mockResolvedValue({});
      mockActionLogRepo.create.mockResolvedValue({});

      await service.handleCron();

      // Should still try to process env2
      expect(mockEc2Service.terminateInstance).toHaveBeenCalledTimes(2);
    });

    it('should handle environment with no resourceId', async () => {
      const env = {
        id: 'env-no-resource',
        resourceId: null,
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        hourlyCost: 0.0104,
        expiresAt: new Date(Date.now() - 1000),
      };

      mockSandboxEnvRepo.findExpiredRunning.mockResolvedValue([env]);
      mockSandboxEnvRepo.updateStatus.mockResolvedValue({});
      mockActionLogRepo.create.mockResolvedValue({});

      await service.handleCron();

      expect(mockEc2Service.terminateInstance).not.toHaveBeenCalled();
      expect(mockSandboxEnvRepo.updateStatus).toHaveBeenCalled();
    });
  });
});

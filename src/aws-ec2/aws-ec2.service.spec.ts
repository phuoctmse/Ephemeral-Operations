import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AwsEc2Service } from './aws-ec2.service';
import { EC2Client, RunInstancesCommand, TerminateInstancesCommand, CreateTagsCommand } from '@aws-sdk/client-ec2';
import { mockClient } from 'aws-sdk-client-mock';

describe('AwsEc2Service', () => {
  let service: AwsEc2Service;
  let ec2Mock: ReturnType<typeof mockClient>;

  beforeEach(async () => {
    ec2Mock = mockClient(EC2Client);

    const module = await Test.createTestingModule({
      providers: [
        AwsEc2Service,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, defaultValue?: string) => {
              const config: Record<string, string> = {
                'app.awsRegion': 'us-east-1',
                'app.awsEndpoint': 'http://localhost:4566',
                'app.awsAccessKeyId': 'test',
                'app.awsSecretAccessKey': 'test',
              };
              return config[key] ?? defaultValue;
            },
          },
        },
      ],
    }).compile();

    service = module.get<AwsEc2Service>(AwsEc2Service);
  });

  afterEach(() => {
    ec2Mock.reset();
  });

  describe('runInstance', () => {
    it('should return an instance ID on success', async () => {
      ec2Mock.on(RunInstancesCommand).resolves({
        Instances: [{ InstanceId: 'i-0abc123def456' }],
      } as never);

      const instanceId = await service.runInstance('t3.micro');
      expect(instanceId).toBe('i-0abc123def456');
    });

    it('should throw when no instance is returned', async () => {
      ec2Mock.on(RunInstancesCommand).resolves({
        Instances: [],
      } as never);

      await expect(service.runInstance('t3.micro')).rejects.toThrow(
        'did not return an InstanceId',
      );
    });

    it('should throw on AWS SDK error', async () => {
      ec2Mock.on(RunInstancesCommand).rejects(new Error('AWS SDK error'));

      await expect(service.runInstance('t3.micro')).rejects.toThrow(
        'AWS SDK error',
      );
    });
  });

  describe('terminateInstance', () => {
    it('should call TerminateInstances successfully', async () => {
      ec2Mock.on(TerminateInstancesCommand).resolves({
        TerminatingInstances: [{ InstanceId: 'i-0abc123def456' }],
      } as never);

      await expect(
        service.terminateInstance('i-0abc123def456'),
      ).resolves.not.toThrow();
    });

    it('should throw on AWS SDK error during termination', async () => {
      ec2Mock.on(TerminateInstancesCommand).rejects(new Error('Terminate failed'));

      await expect(
        service.terminateInstance('i-0abc123def456'),
      ).rejects.toThrow('Terminate failed');
    });
  });

  describe('createTags', () => {
    it('should tag an instance successfully', async () => {
      ec2Mock.on(CreateTagsCommand).resolves({} as never);

      await expect(
        service.createTags('i-0abc123def456', { Project: 'EphOps' }),
      ).resolves.not.toThrow();
    });
  });
});

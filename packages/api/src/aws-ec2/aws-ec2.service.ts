import { Inject, Injectable, Logger } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import {
  EC2Client,
  RunInstancesCommand,
  TerminateInstancesCommand,
  CreateTagsCommand,
  type _InstanceType,
} from '@aws-sdk/client-ec2';
import { EPHOPS_TAG } from '../common/constants/finops.constants';
import appConfig from '../common/config/app.config';

@Injectable()
export class AwsEc2Service {
  private readonly logger = new Logger(AwsEc2Service.name);
  private readonly client: EC2Client;

  constructor(
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
  ) {
    this.client = new EC2Client({
      region: this.config.awsRegion,
      ...(this.config.awsEndpoint && { endpoint: this.config.awsEndpoint }),
      credentials: {
        accessKeyId: this.config.awsAccessKeyId,
        secretAccessKey: this.config.awsSecretAccessKey,
      },
    });
  }

  async runInstance(instanceType: string): Promise<string> {
    this.logger.log(`Requesting EC2 instance: ${instanceType}`);

    const command = new RunInstancesCommand({
      ImageId: 'ami-00000000000000000', // Placeholder; override in .env or config
      InstanceType: instanceType as _InstanceType,
      MinCount: 1,
      MaxCount: 1,
      TagSpecifications: [
        {
          ResourceType: 'instance',
          Tags: Object.entries(EPHOPS_TAG).map(([Key, Value]) => ({
            Key,
            Value,
          })),
        },
      ],
    });

    const result = await this.client.send(command);
    const instanceId = result.Instances?.[0]?.InstanceId;

    if (!instanceId) {
      throw new Error('EC2 RunInstances did not return an InstanceId');
    }

    this.logger.log(`EC2 instance created: ${instanceId}`);
    return instanceId;
  }

  async terminateInstance(instanceId: string): Promise<void> {
    this.logger.log(`Terminating EC2 instance: ${instanceId}`);

    const command = new TerminateInstancesCommand({
      InstanceIds: [instanceId],
    });

    await this.client.send(command);
    this.logger.log(`EC2 instance terminated: ${instanceId}`);
  }

  async createTags(
    instanceId: string,
    tags: Record<string, string>,
  ): Promise<void> {
    this.logger.log(
      `Tagging EC2 instance ${instanceId}: ${JSON.stringify(tags)}`,
    );

    const command = new CreateTagsCommand({
      Resources: [instanceId],
      Tags: Object.entries(tags).map(([Key, Value]) => ({ Key, Value })),
    });

    await this.client.send(command);
  }
}

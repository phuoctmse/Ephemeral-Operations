import { Module } from '@nestjs/common';
import { AwsEc2Service } from './aws-ec2.service';

@Module({
  providers: [AwsEc2Service],
  exports: [AwsEc2Service],
})
export class AwsEc2Module {}

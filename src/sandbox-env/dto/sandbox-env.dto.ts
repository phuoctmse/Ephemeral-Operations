import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNumber,
  IsString,
  IsOptional,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSandboxEnvDto {
  @ApiProperty({ description: 'Natural language request from the user', example: 'I need a Linux test server for 1 hour' })
  @IsString()
  prompt!: string;

  @ApiPropertyOptional({ description: 'EC2 instance type', enum: ['t3.micro', 't4g.nano'], default: 't3.micro' })
  @IsOptional()
  @IsEnum(['t3.micro', 't4g.nano'])
  instanceType?: 't3.micro' | 't4g.nano';

  @ApiPropertyOptional({ description: 'Time-to-live in hours (0.5 - 2)', default: 1, minimum: 0.5, maximum: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.5)
  @Max(2)
  ttlHours?: number;
}

export class SandboxEnvResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() prompt!: string;
  @ApiPropertyOptional() resourceId!: string | null;
  @ApiProperty() instanceType!: string;
  @ApiProperty({ enum: ['CREATING', 'RUNNING', 'DESTROYED', 'FAILED'] }) status!: string;
  @ApiProperty() hourlyCost!: number;
  @ApiProperty() costIncurred!: number;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() expiresAt!: Date;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class CreateActionLogDto {
  @ApiProperty() @IsString() envId!: string;
  @ApiProperty() @IsString() agentReasoning!: string;
  @ApiProperty() @IsString() toolCalled!: string;
  @ApiProperty() @IsString() output!: string;
}

export class ActionLogResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() envId!: string;
  @ApiProperty() agentReasoning!: string;
  @ApiProperty() toolCalled!: string;
  @ApiProperty() output!: string;
  @ApiProperty() timestamp!: Date;
}

export class FilterActionLogDto {
  @ApiPropertyOptional() @IsOptional() @IsString() envId?: string;
}

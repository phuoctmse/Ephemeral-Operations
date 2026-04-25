import { Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { PolicyStoreService } from './policy-store.service';
import { ApiKeyGuard } from '../common/guards/api-key.guard';

@ApiTags('Admin')
@ApiSecurity('api-key')
@UseGuards(ApiKeyGuard)
@Controller('admin/policy')
export class PolicyAdminController {
  constructor(private readonly store: PolicyStoreService) {}

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Manually reload policy documents from disk' })
  @ApiResponse({
    status: 200,
    description: 'Documents reloaded',
    schema: { example: { reloaded: true, documentCount: 3 } },
  })
  refresh(): { reloaded: boolean; documentCount: number } {
    this.store.loadDocuments();
    return { reloaded: true, documentCount: this.store.getDocumentCount() };
  }

  @Cron(CronExpression.EVERY_HOUR)
  handleCronRefresh(): void {
    this.store.loadDocuments();
  }
}

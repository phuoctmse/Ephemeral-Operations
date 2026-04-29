import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiSecurity } from '@nestjs/swagger';
import { ActionLogService } from './action-log.service';
import { FilterActionLogDto } from './dto/action-log.dto';
import { ApiKeyGuard } from '../common/guards/api-key.guard';

@ApiTags('Action Logs')
@ApiSecurity('api-key')
@UseGuards(ApiKeyGuard)
@Controller('action-logs')
export class ActionLogController {
  constructor(private readonly service: ActionLogService) {}

  @Get()
  @ApiOperation({ summary: 'List action logs, optionally filtered by envId' })
  @ApiQuery({
    name: 'envId',
    required: false,
    description: 'Filter by environment ID',
  })
  async findAll(@Query() filter: FilterActionLogDto) {
    return this.service.findAll(filter.envId);
  }
}

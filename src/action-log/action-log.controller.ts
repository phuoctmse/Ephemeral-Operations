import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ActionLogService } from './action-log.service';
import { FilterActionLogDto } from './dto/action-log.dto';

@ApiTags('Action Logs')
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

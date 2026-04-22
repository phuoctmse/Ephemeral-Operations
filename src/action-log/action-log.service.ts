import { Injectable } from '@nestjs/common';
import { ActionLogRepository } from './action-log.repository';

@Injectable()
export class ActionLogService {
  constructor(private readonly repo: ActionLogRepository) {}

  async findAll(envId?: string) {
    if (envId) {
      return this.repo.findByEnvId(envId);
    }
    return this.repo.findAll();
  }

  async create(data: {
    envId: string;
    agentReasoning: string;
    toolCalled: string;
    output: string;
  }) {
    return this.repo.create(data);
  }
}

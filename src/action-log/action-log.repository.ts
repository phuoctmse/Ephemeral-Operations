import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ActionLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    envId: string;
    agentReasoning: string;
    toolCalled: string;
    output: string;
    durationMs?: number;
  }) {
    return this.prisma.actionLog.create({ data });
  }

  async findByEnvId(envId: string) {
    return this.prisma.actionLog.findMany({
      where: { envId },
      orderBy: { timestamp: 'desc' },
    });
  }

  async findAll() {
    return this.prisma.actionLog.findMany({
      orderBy: { timestamp: 'desc' },
    });
  }
}

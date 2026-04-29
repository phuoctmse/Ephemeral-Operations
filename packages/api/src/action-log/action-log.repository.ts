import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ActionLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeDurationMs<T extends { durationMs: number | null }>(log: T) {
    return {
      ...log,
      durationMs: log.durationMs ?? 0,
    };
  }

  async create(data: {
    envId: string;
    agentReasoning: string;
    toolCalled: string;
    output: string;
    durationMs?: number;
  }) {
    return this.prisma.actionLog.create({
      data: {
        ...data,
        durationMs: data.durationMs ?? 0,
      },
    });
  }

  async findByEnvId(envId: string) {
    const logs = await this.prisma.actionLog.findMany({
      where: { envId },
      orderBy: { timestamp: 'desc' },
    });

    return logs.map((log) => this.normalizeDurationMs(log));
  }

  async findAll() {
    const logs = await this.prisma.actionLog.findMany({
      orderBy: { timestamp: 'desc' },
    });

    return logs.map((log) => this.normalizeDurationMs(log));
  }
}

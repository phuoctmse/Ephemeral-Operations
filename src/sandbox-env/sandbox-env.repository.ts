import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EnvStatus } from '@prisma/client';

@Injectable()
export class SandboxEnvRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    prompt: string;
    instanceType: string;
    expiresAt: Date;
    hourlyCost: number;
  }) {
    return this.prisma.sandboxEnv.create({ data });
  }

  async findById(id: string) {
    return this.prisma.sandboxEnv.findUnique({
      where: { id },
      include: { logs: true },
    });
  }

  async findAll() {
    return this.prisma.sandboxEnv.findMany({
      orderBy: { createdAt: 'desc' },
      include: { logs: true },
    });
  }

  async findRunningEnvs() {
    return this.prisma.sandboxEnv.findMany({
      where: { status: EnvStatus.RUNNING },
    });
  }

  async findExpiredRunning() {
    return this.prisma.sandboxEnv.findMany({
      where: {
        status: EnvStatus.RUNNING,
        expiresAt: { lt: new Date() },
      },
    });
  }

  async updateStatus(id: string, status: EnvStatus, extra?: { resourceId?: string; costIncurred?: number }) {
    return this.prisma.sandboxEnv.update({
      where: { id },
      data: {
        status,
        ...(extra?.resourceId !== undefined && { resourceId: extra.resourceId }),
        ...(extra?.costIncurred !== undefined && { costIncurred: extra.costIncurred }),
      },
    });
  }

  async updateToFailed(id: string, reason: string) {
    return this.prisma.sandboxEnv.update({
      where: { id },
      data: {
        status: EnvStatus.FAILED,
        logs: {
          create: {
            agentReasoning: reason,
            toolCalled: 'provision_resources',
            output: 'FAILED',
          },
        },
      },
    });
  }

  async countRunning(): Promise<number> {
    return this.prisma.sandboxEnv.count({
      where: { status: EnvStatus.RUNNING },
    });
  }

  async deleteById(id: string) {
    return this.prisma.sandboxEnv.delete({ where: { id } });
  }
}

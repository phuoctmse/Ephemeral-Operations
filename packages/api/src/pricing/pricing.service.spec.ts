import { Test } from '@nestjs/testing';
import { PricingClient, GetProductsCommand } from '@aws-sdk/client-pricing';
import { PricingService } from './pricing.service';
import { PrismaService } from '../prisma/prisma.service';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import appConfig from '../common/config/app.config';

type CachedPrice = {
  hourlyCost: number;
  updatedAt: Date;
};

type PricingRow = {
  instanceType: string;
  hourlyCost: number;
  updatedAt?: Date;
};

type MockPrisma = {
  pricingCache: {
    findUnique: (args: unknown) => Promise<CachedPrice | null>;
    findMany: (args: unknown) => Promise<PricingRow[]>;
    upsert: (args: unknown) => Promise<Record<string, never>>;
  };
};

describe('PricingService', () => {
  let service: PricingService;
  let mockPrisma: MockPrisma;
  let findUniqueMock: jest.MockedFunction<
    (args: unknown) => Promise<CachedPrice | null>
  >;
  let findManyMock: jest.MockedFunction<
    (args: unknown) => Promise<PricingRow[]>
  >;
  let upsertMock: jest.MockedFunction<
    (args: unknown) => Promise<Record<string, never>>
  >;
  let sendSpy: jest.SpiedFunction<typeof PricingClient.prototype.send>;

  beforeEach(async () => {
    findUniqueMock = jest.fn<(args: unknown) => Promise<CachedPrice | null>>();
    findManyMock = jest.fn<(args: unknown) => Promise<PricingRow[]>>();
    upsertMock = jest.fn<(args: unknown) => Promise<Record<string, never>>>();

    findUniqueMock.mockResolvedValue(null);
    findManyMock.mockResolvedValue([]);
    upsertMock.mockResolvedValue({});

    mockPrisma = {
      pricingCache: {
        findUnique: findUniqueMock,
        findMany: findManyMock,
        upsert: upsertMock,
      },
    };

    sendSpy = jest
      .spyOn(PricingClient.prototype, 'send')
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      .mockImplementation((command) => {
        if (command instanceof GetProductsCommand) {
          const filters = command.input.Filters ?? [];
          const instanceType =
            filters.find((filter) => filter.Field === 'instanceType')?.Value ??
            't3.micro';

          const priceMap: Record<string, string> = {
            't3.micro': '0.0104000000',
            't4g.nano': '0.0042000000',
          };

          return Promise.resolve({
            PriceList: [
              JSON.stringify({
                product: {
                  attributes: { instanceType },
                },
                terms: {
                  OnDemand: {
                    '1': {
                      priceDimensions: {
                        '1': {
                          unit: 'Hrs',
                          pricePerUnit: {
                            USD: priceMap[instanceType] ?? '0.0104',
                          },
                        },
                      },
                    },
                  },
                },
              }),
            ],
          });
        }

        return Promise.resolve({});
      });

    const module = await Test.createTestingModule({
      providers: [
        PricingService,
        {
          provide: appConfig.KEY,
          useValue: {
            awsAccessKeyId: 'test',
            awsSecretAccessKey: 'test',
          },
        },
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<PricingService>(PricingService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getHourlyCost', () => {
    it('should return cached price when fresh', async () => {
      const updatedAt = new Date(Date.now() - 1000 * 60 * 60); // 1 hour ago
      findUniqueMock.mockResolvedValue({
        hourlyCost: 0.0104,
        updatedAt,
      });

      const cost = await service.getHourlyCost('t3.micro', 'us-east-1');
      expect(cost).toBe(0.0104);
      expect(findUniqueMock).toHaveBeenCalledWith({
        where: {
          instanceType_region: {
            instanceType: 't3.micro',
            region: 'us-east-1',
          },
        },
      });
    });

    it('should trigger background sync and return stale cache', async () => {
      const updatedAt = new Date(Date.now() - 1000 * 60 * 60 * 25); // 25 hours ago
      findUniqueMock.mockResolvedValue({
        hourlyCost: 0.0104,
        updatedAt,
      });
      upsertMock.mockResolvedValue({});

      const cost = await service.getHourlyCost('t3.micro', 'us-east-1');
      expect(cost).toBe(0.0104);
    });

    it('should sync from AWS when cache miss and return price', async () => {
      findUniqueMock.mockResolvedValue(null);
      upsertMock.mockResolvedValue({});
      findUniqueMock
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ hourlyCost: 0.0104, updatedAt: new Date() });

      const cost = await service.getHourlyCost('t3.micro', 'us-east-1');
      expect(cost).toBe(0.0104);
      expect(sendSpy).toHaveBeenCalled();
    });

    it('should fallback to static table when AWS and cache fail', async () => {
      findUniqueMock.mockResolvedValue(null);
      upsertMock.mockRejectedValue(new Error('DB down'));
      sendSpy.mockImplementation(() => {
        throw new Error('AWS down');
      });

      const cost = await service.getHourlyCost('t3.micro', 'us-east-1');
      expect(cost).toBe(0.0104);
    });
  });

  describe('getPricingTable', () => {
    it('should return cached pricing table', async () => {
      findManyMock.mockResolvedValue([
        { instanceType: 't3.micro', hourlyCost: 0.0104, updatedAt: new Date() },
        { instanceType: 't4g.nano', hourlyCost: 0.0042, updatedAt: new Date() },
      ]);

      const table = await service.getPricingTable('us-east-1');
      expect(table).toEqual({
        't3.micro': 0.0104,
        't4g.nano': 0.0042,
      });
    });

    it('should sync and return table when cache empty', async () => {
      findManyMock.mockResolvedValue([]);
      upsertMock.mockResolvedValue({});
      findManyMock.mockResolvedValueOnce([]).mockResolvedValueOnce([
        { instanceType: 't3.micro', hourlyCost: 0.0104 },
        { instanceType: 't4g.nano', hourlyCost: 0.0042 },
      ]);

      const table = await service.getPricingTable('us-east-1');
      expect(table).toEqual({
        't3.micro': 0.0104,
        't4g.nano': 0.0042,
      });
    });
  });

  describe('getPricingTableForPrompt', () => {
    it('should format pricing for LLM prompt', async () => {
      findManyMock.mockResolvedValue([
        { instanceType: 't3.micro', hourlyCost: 0.0104, updatedAt: new Date() },
        { instanceType: 't4g.nano', hourlyCost: 0.0042, updatedAt: new Date() },
      ]);

      const promptText = await service.getPricingTableForPrompt('us-east-1');
      expect(promptText).toContain('t3.micro: $0.0104/hour');
      expect(promptText).toContain('t4g.nano: $0.0042/hour');
    });
  });
});

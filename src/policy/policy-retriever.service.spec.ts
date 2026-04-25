import { Test, TestingModule } from '@nestjs/testing';
import { PolicyRetrieverService } from './policy-retriever.service';
import { PolicyStoreService } from './policy-store.service';

const mockDocs = [
  {
    id: 'policy/guardrails',
    type: 'policy' as const,
    title: 'EphOps Guardrails Policy',
    content:
      'Only t3.micro and t4g.nano are allowed. Maximum TTL is 2 hours. Concurrency limit is 2.',
    keywords: ['guardrails', 'instance type', 'ttl', 'concurrency', 'limit'],
  },
  {
    id: 'runbook/cleanup',
    type: 'runbook' as const,
    title: 'EphOps Cleanup Runbook',
    content:
      'The cleanup worker destroys expired environments. Manual cleanup: DELETE /sandbox-env/:id.',
    keywords: ['cleanup', 'destroy', 'terminate', 'expired', 'ttl', 'worker'],
  },
];

describe('PolicyRetrieverService', () => {
  let service: PolicyRetrieverService;
  let store: PolicyStoreService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PolicyRetrieverService,
        {
          provide: PolicyStoreService,
          useValue: {
            findRelevant: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PolicyRetrieverService>(PolicyRetrieverService);
    store = module.get<PolicyStoreService>(PolicyStoreService);
  });

  it('should return relevant documents for a matching prompt', () => {
    jest.spyOn(store, 'findRelevant').mockReturnValue([mockDocs[0]]);

    const result = service.findRelevant('I need a t3.micro instance');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('policy/guardrails');
  });

  it('should return empty array when no documents match', () => {
    jest.spyOn(store, 'findRelevant').mockReturnValue([]);

    const result = service.findRelevant('some unrelated prompt');
    expect(result).toHaveLength(0);
  });

  it('should return empty array and not throw when store throws', () => {
    jest.spyOn(store, 'findRelevant').mockImplementation(() => {
      throw new Error('Store failure');
    });

    expect(() => service.findRelevant('any prompt')).not.toThrow();
    expect(service.findRelevant('any prompt')).toEqual([]);
  });

  it('should build a non-empty context snippet when docs are found', () => {
    jest.spyOn(store, 'findRelevant').mockReturnValue([mockDocs[0]]);

    const snippet = service.buildContextSnippet('concurrency limit exceeded');
    expect(snippet).toContain('EphOps Guardrails Policy');
    expect(snippet.length).toBeGreaterThan(0);
  });

  it('should return empty string when no docs match', () => {
    jest.spyOn(store, 'findRelevant').mockReturnValue([]);

    const snippet = service.buildContextSnippet('unrelated prompt');
    expect(snippet).toBe('');
  });

  it('should truncate long document content in snippet', () => {
    const longDoc = {
      ...mockDocs[0],
      content: 'A'.repeat(1000),
    };
    jest.spyOn(store, 'findRelevant').mockReturnValue([longDoc]);

    const snippet = service.buildContextSnippet('guardrails');
    expect(snippet.length).toBeLessThan(800);
    expect(snippet).toContain('...');
  });
});

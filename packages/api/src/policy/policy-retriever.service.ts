import { Injectable, Logger } from '@nestjs/common';
import {
  PolicyStoreService,
  type PolicyDocument,
} from './policy-store.service';

const MAX_CONTEXT_CHARS = 600;

@Injectable()
export class PolicyRetrieverService {
  private readonly logger = new Logger(PolicyRetrieverService.name);

  constructor(private readonly store: PolicyStoreService) {}

  /**
   * Returns relevant documents for a given prompt.
   * Safe to call — returns [] on any error.
   */
  findRelevant(prompt: string): PolicyDocument[] {
    try {
      return this.store.findRelevant(prompt);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.warn(`PolicyRetriever.findRelevant failed: ${errorMessage}`);
      return [];
    }
  }

  /**
   * Builds a compact context string to inject into the LLM prompt.
   * Truncates each document to avoid bloating the prompt.
   */
  buildContextSnippet(prompt: string): string {
    const docs = this.findRelevant(prompt);
    if (docs.length === 0) return '';

    const snippets = docs.map((doc) => {
      const truncated =
        doc.content.length > MAX_CONTEXT_CHARS
          ? doc.content.slice(0, MAX_CONTEXT_CHARS) + '...'
          : doc.content;
      return `[${doc.title}]\n${truncated}`;
    });

    return snippets.join('\n\n---\n\n');
  }
}

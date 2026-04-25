import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface PolicyDocument {
  id: string;
  type: 'policy' | 'runbook';
  title: string;
  content: string;
  keywords: string[];
}

@Injectable()
export class PolicyStoreService implements OnModuleInit {
  private readonly logger = new Logger(PolicyStoreService.name);
  private documents: PolicyDocument[] = [];

  private readonly docsRoot = path.join(__dirname, 'documents');

  onModuleInit() {
    this.loadDocuments();
  }

  loadDocuments(): void {
    const loaded: PolicyDocument[] = [];

    for (const type of ['policy', 'runbook'] as const) {
      const dir = path.join(this.docsRoot, type);
      if (!fs.existsSync(dir)) continue;

      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(dir, file), 'utf-8');
          const doc = this.parseDocument(file, type, content);
          loaded.push(doc);
        } catch (err) {
          this.logger.warn(
            `Failed to load document ${file}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }

    this.documents = loaded;
    this.logger.log(`PolicyStore loaded ${loaded.length} documents`);
  }

  findRelevant(prompt: string, maxResults = 2): PolicyDocument[] {
    if (this.documents.length === 0) return [];

    const promptLower = prompt.toLowerCase();
    const words = promptLower.split(/\s+/).filter((w) => w.length > 2);

    const scored = this.documents.map((doc) => {
      const keywordMatches = doc.keywords.filter((kw) =>
        promptLower.includes(kw.toLowerCase()),
      ).length;

      const wordMatches = words.filter((w) =>
        doc.content.toLowerCase().includes(w),
      ).length;

      return { doc, score: keywordMatches * 3 + wordMatches };
    });

    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .map((s) => s.doc);
  }

  getAll(): PolicyDocument[] {
    return this.documents;
  }

  getDocumentCount(): number {
    return this.documents.length;
  }

  private parseDocument(
    filename: string,
    type: 'policy' | 'runbook',
    content: string,
  ): PolicyDocument {
    const lines = content.split('\n');
    const titleLine = lines.find((l) => l.startsWith('# '));
    const title = titleLine ? titleLine.replace('# ', '').trim() : filename;

    // Extract keywords from the last "## Keywords" section
    const keywordsIndex = lines.findIndex((l) =>
      l.toLowerCase().startsWith('## keywords'),
    );
    let keywords: string[] = [];
    if (keywordsIndex !== -1) {
      const keywordsLine = lines[keywordsIndex + 1] ?? '';
      keywords = keywordsLine
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);
    }

    const id = `${type}/${filename.replace('.md', '')}`;
    return { id, type, title, content, keywords };
  }
}

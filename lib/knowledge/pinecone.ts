import { Pinecone, type Index, type RecordMetadata } from '@pinecone-database/pinecone';
import {
  KnowledgeVectorMetadata,
  KnowledgeSearchResult,
  DeleteDocumentInput,
  DeleteDocumentResult,
} from './types';

// Guard: Pinecone operations must run server-side only
if (typeof window !== 'undefined') {
  throw new Error('Pinecone client can only be used server-side.');
}

export interface VectorRecord {
  id: string;
  values: number[];
  metadata: KnowledgeVectorMetadata;
}

export interface QueryVectorsParams {
  companyId: string;
  vector: number[];
  topK?: number;
  category?: string;
  minScore?: number;
}

/**
 * In-memory vector store used during offline development, tests,
 * or when PINECONE_API_KEY is not yet configured.
 */
class InMemoryVectorStore {
  private records = new Map<string, VectorRecord>();

  public async upsert(vectors: VectorRecord[]): Promise<void> {
    for (const v of vectors) {
      this.records.set(v.id, v);
    }
  }

  public async query(params: QueryVectorsParams): Promise<KnowledgeSearchResult[]> {
    const { companyId, vector, topK = 5, category, minScore = 0.0 } = params;
    const scored: Array<{ record: VectorRecord; score: number }> = [];

    for (const record of this.records.values()) {
      // INVARIANT: Strictly restrict search to companyId
      if (record.metadata.companyId !== companyId) {
        continue;
      }

      if (category && record.metadata.category !== category) {
        continue;
      }

      // Cosine similarity
      let dot = 0;
      let normA = 0;
      let normB = 0;
      const vA = vector;
      const vB = record.values;

      for (let i = 0; i < vA.length; i++) {
        dot += vA[i] * vB[i];
        normA += vA[i] * vA[i];
        normB += vB[i] * vB[i];
      }

      const score =
        normA > 0 && normB > 0 ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;

      if (score >= minScore) {
        scored.push({ record, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, topK).map(({ record, score }) => ({
      id: record.id,
      score: Number(score.toFixed(4)),
      text: record.metadata.text,
      companyId: record.metadata.companyId,
      documentId: record.metadata.documentId,
      documentName: record.metadata.documentName,
      category: record.metadata.category,
      chunkIndex: record.metadata.chunkIndex,
      totalChunks: record.metadata.totalChunks,
    }));
  }

  public async deleteDocument(
    companyId: string,
    documentId: string,
  ): Promise<number> {
    let deleted = 0;
    for (const [id, record] of this.records.entries()) {
      if (
        record.metadata.companyId === companyId &&
        record.metadata.documentId === documentId
      ) {
        this.records.delete(id);
        deleted++;
      }
    }
    return deleted;
  }

  public clear(): void {
    this.records.clear();
  }

  public size(): number {
    return this.records.size;
  }
}

export const inMemoryStore = new InMemoryVectorStore();

let pineconeClientInstance: Pinecone | null = null;

export function getPineconeClient(): Pinecone | null {
  const apiKey = process.env.PINECONE_API_KEY;
  if (!apiKey || process.env.USE_MOCK_PINECONE === 'true') {
    return null;
  }

  if (!pineconeClientInstance) {
    pineconeClientInstance = new Pinecone({ apiKey });
  }

  return pineconeClientInstance;
}

export function getPineconeIndex(): Index | null {
  const client = getPineconeClient();
  const raw = (process.env.PINECONE_INDEX || '').trim();
  if (!client || !raw) {
    return null;
  }

  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.includes('.pinecone.io')) {
    const host = raw.replace(/^https?:\/\//, '');
    return client.index({ host });
  }

  return client.index(raw);
}

/**
 * Upserts vector records into Pinecone (or fallback store).
 */
export async function upsertVectors(vectors: VectorRecord[]): Promise<void> {
  if (vectors.length === 0) return;

  // Validate required metadata fields for each vector
  for (const v of vectors) {
    if (
      !v.metadata.companyId ||
      !v.metadata.documentId ||
      !v.metadata.category ||
      !v.metadata.documentName
    ) {
      throw new Error(
        `Vector ${v.id} is missing required metadata: companyId, documentId, category, documentName are all mandatory.`,
      );
    }
  }

  const index = getPineconeIndex();
  if (index) {
    // Pinecone expects records in batches of 100-200
    const batchSize = 100;
    for (let i = 0; i < vectors.length; i += batchSize) {
      const batch = vectors.slice(i, i + batchSize).map((v) => ({
        id: v.id,
        values: v.values,
        metadata: v.metadata as unknown as RecordMetadata,
      }));
      await index.upsert({ records: batch });
    }
  } else {
    await inMemoryStore.upsert(vectors);
  }
}

/**
 * Deletes all vectors for a specific document belonging to a company.
 */
export async function deleteDocumentVectors(
  input: DeleteDocumentInput,
): Promise<DeleteDocumentResult> {
  const { companyId, documentId } = input;
  if (!companyId || !documentId) {
    throw new Error('companyId and documentId are required for deletion.');
  }

  const index = getPineconeIndex();
  if (index) {
    try {
      // Primary: serverless metadata filter delete
      await index.deleteMany({
        filter: {
          companyId: { $eq: companyId },
          documentId: { $eq: documentId },
        },
      });
      return {
        success: true,
        message: `Deleted vectors for document ${documentId} (company ${companyId}) from Pinecone.`,
      };
    } catch (error) {
      console.warn(
        '[Pinecone] Metadata filter delete failed, falling back to id prefix delete:',
        error,
      );
      // Fallback: list and delete by ID pattern
      const maxChunksToCheck = 250;
      const idsToDelete = Array.from(
        { length: maxChunksToCheck },
        (_, i) => `${companyId}#${documentId}#${i}`,
      );
      await index.deleteMany(idsToDelete);
      return {
        success: true,
        message: `Deleted vectors for document ${documentId} by ID list.`,
      };
    }
  } else {
    const deletedCount = await inMemoryStore.deleteDocument(companyId, documentId);
    return {
      success: true,
      deletedCount,
      message: `Deleted ${deletedCount} vectors for document ${documentId} (company ${companyId}).`,
    };
  }
}

/**
 * Queries Pinecone with an absolute requirement that search is restricted
 * to the specified companyId.
 */
export async function queryVectors(
  params: QueryVectorsParams,
): Promise<KnowledgeSearchResult[]> {
  const { companyId, vector, topK = 5, category, minScore = 0.0 } = params;

  if (!companyId) {
    throw new Error('companyId is mandatory for every knowledge search.');
  }

  const index = getPineconeIndex();
  if (index) {
    // Pinecone metadata filter strictly scoping to companyId
    const filter: Record<string, unknown> = {
      companyId: { $eq: companyId },
    };

    if (category) {
      filter.category = { $eq: category };
    }

    const queryPromise = index.query({
      vector,
      topK,
      includeMetadata: true,
      filter,
    });
    const timeoutPromise = new Promise<{ matches: [] }>((resolve) =>
      setTimeout(() => resolve({ matches: [] }), 2500),
    );
    const queryResponse = await Promise.race([queryPromise, timeoutPromise]);

    const results: KnowledgeSearchResult[] = [];

    for (const match of queryResponse.matches || []) {
      const score = match.score ?? 0;
      if (score < minScore) continue;

      const meta = match.metadata as unknown as KnowledgeVectorMetadata | undefined;
      if (!meta) continue;

      // Double-check companyId in retrieved metadata as defense in depth
      if (meta.companyId !== companyId) {
        continue;
      }

      results.push({
        id: match.id,
        score: Number(score.toFixed(4)),
        text: meta.text || '',
        companyId: meta.companyId,
        documentId: meta.documentId,
        documentName: meta.documentName,
        category: meta.category,
        chunkIndex: meta.chunkIndex ?? 0,
        totalChunks: meta.totalChunks,
      });
    }

    return results;
  } else {
    return inMemoryStore.query(params);
  }
}

import { chunkDocument } from './chunker';
import { generateBatchEmbeddings, generateEmbedding } from './embeddings';
import {
  upsertVectors,
  deleteDocumentVectors,
  queryVectors,
  type VectorRecord,
} from './pinecone';
import {
  IngestDocumentInput,
  IngestDocumentResult,
  DeleteDocumentInput,
  DeleteDocumentResult,
  SearchKnowledgeInput,
  KnowledgeSearchResult,
  KnowledgeVectorMetadata,
} from './types';

/**
 * Ingests a document through the pipeline:
 * Document → Parse → Chunk → Embed → Pinecone
 *
 * Enforces metadata invariant on every vector:
 * - companyId
 * - documentId
 * - category
 * - documentName
 */
export async function ingestDocument(
  input: IngestDocumentInput,
): Promise<IngestDocumentResult> {
  const {
    companyId,
    documentId,
    category,
    documentName,
    content,
    metadata = {},
  } = input;

  if (!companyId || !companyId.trim()) {
    throw new Error('companyId is required for document ingestion.');
  }
  if (!documentId || !documentId.trim()) {
    throw new Error('documentId is required for document ingestion.');
  }
  if (!category || !category.trim()) {
    throw new Error('category is required for document ingestion.');
  }
  if (!documentName || !documentName.trim()) {
    throw new Error('documentName is required for document ingestion.');
  }
  if (!content || !content.trim()) {
    throw new Error('content cannot be empty.');
  }

  // 1. Parse & Chunk
  const chunks = chunkDocument(content);
  if (chunks.length === 0) {
    throw new Error('Document content produced 0 chunks after parsing.');
  }

  // 2. Embed
  const chunkTexts = chunks.map((c) => c.text);
  const embeddings = await generateBatchEmbeddings(chunkTexts);

  // 3. Construct vector records with mandatory metadata
  const createdAt = Date.now();
  const vectorRecords: VectorRecord[] = chunks.map((chunk, index) => {
    const vectorId = `${companyId}#${documentId}#${chunk.index}`;
    const vectorMetadata: KnowledgeVectorMetadata = {
      companyId: companyId.trim(),
      documentId: documentId.trim(),
      category: category.trim(),
      documentName: documentName.trim(),
      text: chunk.text,
      chunkIndex: chunk.index,
      totalChunks: chunks.length,
      createdAt,
      ...metadata,
    };

    return {
      id: vectorId,
      values: embeddings[index],
      metadata: vectorMetadata,
    };
  });

  // 4. Upsert to Pinecone
  await upsertVectors(vectorRecords);

  return {
    success: true,
    documentId: documentId.trim(),
    companyId: companyId.trim(),
    documentName: documentName.trim(),
    category: category.trim(),
    chunksCount: chunks.length,
    vectorIds: vectorRecords.map((v) => v.id),
  };
}

/**
 * Deletes all vectors for a specific document belonging to a company.
 */
export async function deleteDocument(
  input: DeleteDocumentInput,
): Promise<DeleteDocumentResult> {
  return deleteDocumentVectors(input);
}

/**
 * Reusable knowledge search service.
 * Enforces that every search is strictly restricted to the specified companyId.
 *
 * Example usage:
 * const matches = await searchKnowledge({
 *   companyId: 'company-123',
 *   query: 'What is the refund policy?',
 *   topK: 3
 * });
 */
export async function searchKnowledge(
  input: SearchKnowledgeInput,
): Promise<KnowledgeSearchResult[]> {
  const { companyId, query, topK = 5, category, minScore = 0.0 } = input;

  if (!companyId || !companyId.trim()) {
    throw new Error('companyId is mandatory for every knowledge search.');
  }
  if (!query || !query.trim()) {
    return [];
  }

  // 1. Embed query
  const queryVector = await generateEmbedding(query.trim());

  // 2. Query Pinecone with strict companyId filter
  const results = await queryVectors({
    companyId: companyId.trim(),
    vector: queryVector,
    topK,
    category: category ? category.trim() : undefined,
    minScore,
  });

  return results;
}

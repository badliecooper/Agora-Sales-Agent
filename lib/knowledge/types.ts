export type PineconeMetadataValue = string | number | boolean | string[];

export interface KnowledgeVectorMetadata {
  companyId: string;
  documentId: string;
  category: string;
  documentName: string;
  text: string;
  chunkIndex: number;
  totalChunks: number;
  createdAt: number;
  [key: string]: PineconeMetadataValue;
}

export interface IngestDocumentInput {
  companyId: string;
  documentId: string;
  category: string;
  documentName: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface IngestDocumentResult {
  success: boolean;
  documentId: string;
  companyId: string;
  documentName: string;
  category: string;
  chunksCount: number;
  vectorIds: string[];
}

export interface DeleteDocumentInput {
  companyId: string;
  documentId: string;
}

export interface DeleteDocumentResult {
  success: boolean;
  deletedCount?: number;
  message: string;
}

export interface SearchKnowledgeInput {
  companyId: string;
  query: string;
  topK?: number;
  category?: string;
  minScore?: number;
}

export interface KnowledgeSearchResult {
  id: string;
  score: number;
  text: string;
  companyId: string;
  documentId: string;
  documentName: string;
  category: string;
  chunkIndex: number;
  totalChunks?: number;
}

export interface ChunkedDocumentPart {
  index: number;
  text: string;
  charLength: number;
}

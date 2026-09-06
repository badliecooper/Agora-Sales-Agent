import { NextRequest, NextResponse } from 'next/server';
import { ingestDocument } from '@/lib/knowledge/service';
import { IngestDocumentInput } from '@/lib/knowledge/types';

export async function POST(request: NextRequest) {
  try {
    let body: Partial<IngestDocumentInput>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { companyId, documentId, category, documentName, content, metadata } =
      body;

    if (!companyId || typeof companyId !== 'string' || !companyId.trim()) {
      return NextResponse.json(
        { error: 'companyId is required and must be a non-empty string' },
        { status: 400 },
      );
    }
    if (!documentId || typeof documentId !== 'string' || !documentId.trim()) {
      return NextResponse.json(
        { error: 'documentId is required and must be a non-empty string' },
        { status: 400 },
      );
    }
    if (!category || typeof category !== 'string' || !category.trim()) {
      return NextResponse.json(
        { error: 'category is required and must be a non-empty string' },
        { status: 400 },
      );
    }
    if (
      !documentName ||
      typeof documentName !== 'string' ||
      !documentName.trim()
    ) {
      return NextResponse.json(
        { error: 'documentName is required and must be a non-empty string' },
        { status: 400 },
      );
    }
    if (!content || typeof content !== 'string' || !content.trim()) {
      return NextResponse.json(
        { error: 'content is required and must be a non-empty string' },
        { status: 400 },
      );
    }

    const result = await ingestDocument({
      companyId: companyId.trim(),
      documentId: documentId.trim(),
      category: category.trim(),
      documentName: documentName.trim(),
      content,
      metadata,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('[API /api/knowledge/ingest] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to ingest document',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

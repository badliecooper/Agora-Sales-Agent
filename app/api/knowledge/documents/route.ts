import { NextRequest, NextResponse } from 'next/server';
import { deleteDocument } from '@/lib/knowledge/service';

export async function DELETE(request: NextRequest) {
  try {
    let companyId: string | null = null;
    let documentId: string | null = null;

    const url = new URL(request.url);
    companyId = url.searchParams.get('companyId');
    documentId = url.searchParams.get('documentId');

    if (!companyId || !documentId) {
      try {
        const body = await request.json();
        companyId = companyId || body.companyId;
        documentId = documentId || body.documentId;
      } catch {
        // Body is optional if query params are provided
      }
    }

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

    const result = await deleteDocument({
      companyId: companyId.trim(),
      documentId: documentId.trim(),
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('[API /api/knowledge/documents] Delete error:', error);
    return NextResponse.json(
      {
        error: 'Failed to delete document',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

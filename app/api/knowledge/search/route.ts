import { NextRequest, NextResponse } from 'next/server';
import { searchKnowledge } from '@/lib/knowledge/service';

export async function POST(request: NextRequest) {
  try {
    let body: {
      companyId?: string;
      query?: string;
      topK?: number;
      category?: string;
      minScore?: number;
    };

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { companyId, query, topK, category, minScore } = body;

    if (!companyId || typeof companyId !== 'string' || !companyId.trim()) {
      return NextResponse.json(
        { error: 'companyId is required and must be a non-empty string' },
        { status: 400 },
      );
    }
    if (!query || typeof query !== 'string' || !query.trim()) {
      return NextResponse.json(
        { error: 'query is required and must be a non-empty string' },
        { status: 400 },
      );
    }

    const results = await searchKnowledge({
      companyId: companyId.trim(),
      query: query.trim(),
      topK: typeof topK === 'number' ? topK : undefined,
      category: typeof category === 'string' ? category : undefined,
      minScore: typeof minScore === 'number' ? minScore : undefined,
    });

    return NextResponse.json({ results }, { status: 200 });
  } catch (error) {
    console.error('[API /api/knowledge/search] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to search knowledge base',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const companyId = url.searchParams.get('companyId');
    const query = url.searchParams.get('query');
    const topKStr = url.searchParams.get('topK');
    const category = url.searchParams.get('category') || undefined;

    if (!companyId || !companyId.trim()) {
      return NextResponse.json(
        { error: 'companyId is required' },
        { status: 400 },
      );
    }
    if (!query || !query.trim()) {
      return NextResponse.json(
        { error: 'query is required' },
        { status: 400 },
      );
    }

    const topK = topKStr ? parseInt(topKStr, 10) : undefined;

    const results = await searchKnowledge({
      companyId: companyId.trim(),
      query: query.trim(),
      topK: Number.isNaN(topK) ? undefined : topK,
      category,
    });

    return NextResponse.json({ results }, { status: 200 });
  } catch (error) {
    console.error('[API /api/knowledge/search] GET Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to search knowledge base',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

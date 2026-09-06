import {
  ingestDocument,
  searchKnowledge,
  deleteDocument,
} from '../lib/knowledge/service';
import { inMemoryStore } from '../lib/knowledge/pinecone';
import { NextRequest } from 'next/server';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`[Assertion Failure] ${message}`);
  }
}

async function getJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

async function testKnowledgePipelineAndIsolation() {
  console.log('--- 1. Testing Document Ingestion (Document → Parse → Chunk → Embed → Pinecone) ---');
  inMemoryStore.clear();

  const acmeDoc = {
    companyId: 'company-acme',
    documentId: 'doc-pricing-2026',
    category: 'pricing',
    documentName: 'Enterprise Pricing & Volume Discounts',
    content: `
      Our Enterprise tier costs $1,500 per month and includes unlimited conversational voice agent minutes.
      Customers committing to an annual plan receive an exclusive 20% discount with dedicated account management.
      The custom SLA includes a 99.99% uptime guarantee and sub-500ms voice pipeline response times.
    `,
  };

  const ingestResult = await ingestDocument(acmeDoc);

  assert(ingestResult.success === true, 'Document ingestion should succeed');
  assert(ingestResult.documentId === 'doc-pricing-2026', 'Document ID should match');
  assert(ingestResult.companyId === 'company-acme', 'Company ID should match');
  assert(ingestResult.chunksCount > 0, 'Document should produce at least 1 chunk');
  assert(ingestResult.vectorIds.length === ingestResult.chunksCount, 'Should have vector ID per chunk');

  console.log('--- 2. Verifying Vector Creation & Required Metadata ---');
  // Verify vector ID format: ${companyId}#${documentId}#${chunkIndex}
  assert(
    ingestResult.vectorIds[0].startsWith('company-acme#doc-pricing-2026#'),
    `Vector ID must follow companyId#docId#index format: ${ingestResult.vectorIds[0]}`,
  );

  console.log('--- 3. Testing Semantic Search for Ingested Information ---');
  const searchResultsAcme = await searchKnowledge({
    companyId: 'company-acme',
    query: 'What is the annual plan discount and monthly cost?',
    topK: 3,
  });

  assert(searchResultsAcme.length > 0, 'Company Acme should find results for its query');
  assert(
    searchResultsAcme[0].companyId === 'company-acme',
    'Result companyId must equal company-acme',
  );
  assert(
    searchResultsAcme[0].documentId === 'doc-pricing-2026',
    'Result documentId must match doc-pricing-2026',
  );
  assert(
    searchResultsAcme[0].category === 'pricing',
    'Result category must match pricing',
  );
  assert(
    searchResultsAcme[0].documentName === 'Enterprise Pricing & Volume Discounts',
    'Result documentName must match',
  );
  assert(
    searchResultsAcme[0].text.includes('20% discount'),
    'Result text should contain the relevant chunk text',
  );
  console.log(`✓ Acme search returned match with score: ${searchResultsAcme[0].score}`);

  console.log('--- 4. Verifying Cross-Company Isolation (Tenant Security) ---');
  // Company Beta searches for the EXACT same query
  const searchResultsBeta = await searchKnowledge({
    companyId: 'company-beta',
    query: 'What is the annual plan discount and monthly cost?',
    topK: 3,
  });

  assert(
    searchResultsBeta.length === 0,
    `CRITICAL: Company Beta retrieved ${searchResultsBeta.length} results from Company Acme! Multi-tenant isolation failed.`,
  );
  console.log('✓ Verified: Company Beta received 0 results for Company Acme data.');

  console.log('--- 5. Testing Multi-Tenant Isolation with Two Distinct Tenants ---');
  // Ingest document for Company Beta
  await ingestDocument({
    companyId: 'company-beta',
    documentId: 'doc-beta-features',
    category: 'product',
    documentName: 'Beta Product Roadmap',
    content: 'Company Beta specializes in real-time healthcare telemetry and HIPAA compliant voice synthesis.',
  });

  // Search as Beta for healthcare
  const betaSearch = await searchKnowledge({
    companyId: 'company-beta',
    query: 'What healthcare compliance do you support?',
    topK: 2,
  });
  assert(betaSearch.length > 0, 'Company Beta should find its own healthcare document');
  assert(betaSearch[0].companyId === 'company-beta', 'Match must belong to company-beta');

  // Search as Acme for healthcare
  const acmeHealthcareSearch = await searchKnowledge({
    companyId: 'company-acme',
    query: 'What healthcare compliance do you support?',
    topK: 2,
  });
  assert(
    acmeHealthcareSearch.every((r) => r.companyId === 'company-acme'),
    'All results returned to Company Acme must strictly belong to Company Acme',
  );
  assert(
    !acmeHealthcareSearch.some((r) => r.documentId === 'doc-beta-features'),
    'Company Acme must NEVER see Company Beta healthcare document',
  );

  // Search as Beta for Acme's pricing
  const betaPricingSearch = await searchKnowledge({
    companyId: 'company-beta',
    query: 'What is the annual plan discount?',
    topK: 2,
  });
  assert(
    betaPricingSearch.every((r) => r.companyId === 'company-beta'),
    'All results returned to Company Beta must strictly belong to Company Beta',
  );
  assert(
    !betaPricingSearch.some((r) => r.documentId === 'doc-pricing-2026'),
    'Company Beta must NEVER see Company Acme pricing document',
  );
  console.log('✓ Verified: Bidirectional multi-tenant isolation confirmed (neither company can see the other).');

  console.log('--- 6. Testing Document Deletion ---');
  const deleteRes = await deleteDocument({
    companyId: 'company-acme',
    documentId: 'doc-pricing-2026',
  });
  assert(deleteRes.success === true, 'Document deletion should succeed');

  // Search again as Acme
  const postDeleteSearch = await searchKnowledge({
    companyId: 'company-acme',
    query: 'What is the annual plan discount and monthly cost?',
    topK: 3,
  });
  assert(
    postDeleteSearch.length === 0,
    'Acme should find 0 results after document deletion',
  );
  console.log('✓ Verified: Deleted document vectors are purged and no longer returned in search.');
}

async function testApiRoutes() {
  console.log('--- 7. Testing Knowledge API Route Handlers ---');
  inMemoryStore.clear();

  // Test Ingest Route Validation
  const { POST: ingestRoute } = await import('../app/api/knowledge/ingest/route');
  const badReq = new NextRequest('http://localhost:3000/api/knowledge/ingest', {
    method: 'POST',
    body: JSON.stringify({ companyId: 'acme' }), // missing other fields
  });
  const badRes = await ingestRoute(badReq);
  assert(badRes.status === 400, 'Ingest route should reject missing documentId');

  // Test Valid Ingest Route
  const validReq = new NextRequest('http://localhost:3000/api/knowledge/ingest', {
    method: 'POST',
    body: JSON.stringify({
      companyId: 'company-sales-corp',
      documentId: 'sales-playbook',
      category: 'objections',
      documentName: 'Sales Objection Handling',
      content: 'When prospects ask about latency, emphasize sub-500ms SD-RTN voice pipeline.',
    }),
  });
  const validRes = await ingestRoute(validReq);
  const validBody = await getJson(validRes);
  assert(validRes.status === 200, 'Ingest route should return 200 on success');
  assert(validBody.success === true, 'Ingest route should return success: true');

  // Test Search Route
  const { POST: searchRoute } = await import('../app/api/knowledge/search/route');
  const searchReq = new NextRequest('http://localhost:3000/api/knowledge/search', {
    method: 'POST',
    body: JSON.stringify({
      companyId: 'company-sales-corp',
      query: 'What should I say when prospects ask about latency?',
    }),
  });
  const searchRes = await searchRoute(searchReq);
  const searchBody = (await getJson(searchRes)) as { results: Array<Record<string, unknown>> };
  assert(searchRes.status === 200, 'Search route should return 200');
  assert(Array.isArray(searchBody.results), 'Search route should return results array');
  assert(searchBody.results.length > 0, 'Search should find the objection handling playbook');
  assert(
    searchBody.results[0].companyId === 'company-sales-corp',
    'Search route results must belong to company-sales-corp',
  );

  // Test Cross-Company Isolation via API Route
  const intruderSearchReq = new NextRequest('http://localhost:3000/api/knowledge/search', {
    method: 'POST',
    body: JSON.stringify({
      companyId: 'other-company',
      query: 'What should I say when prospects ask about latency?',
    }),
  });
  const intruderSearchRes = await searchRoute(intruderSearchReq);
  const intruderSearchBody = (await getJson(intruderSearchRes)) as { results: Array<Record<string, unknown>> };
  assert(
    intruderSearchBody.results.length === 0,
    'Intruding company should receive empty results via API search route',
  );

  // Test Delete Route
  const { DELETE: deleteRoute } = await import('../app/api/knowledge/documents/route');
  const deleteReq = new NextRequest(
    'http://localhost:3000/api/knowledge/documents?companyId=company-sales-corp&documentId=sales-playbook',
    { method: 'DELETE' },
  );
  const deleteRes = await deleteRoute(deleteReq);
  assert(deleteRes.status === 200, 'Delete route should return 200');

  console.log('✓ All API route contracts validated successfully.');
}

async function main() {
  await testKnowledgePipelineAndIsolation();
  await testApiRoutes();
  console.log('\n===========================================');
  console.log('All Pinecone Knowledge Base Tests Passed!');
  console.log('===========================================');
}

main().catch((err) => {
  console.error('[TEST ERROR]', err);
  process.exit(1);
});

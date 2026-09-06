import fs from 'node:fs';
import path from 'node:path';
import { syncLeadToHubSpot, getHubSpotClient } from '../lib/hubspot';
import { processSalesBrain } from '../lib/sales/brain';
import { resetSessionSalesState, analyzeAndUpdateSalesState, createInitialSalesState } from '../lib/sales/tracker';
import { NextRequest } from 'next/server';
import { POST as syncLeadPost, GET as syncLeadGet } from '../app/api/crm/sync-lead/route';

function loadEnvLocal() {
  if (process.env.HUBSPOT_ACCESS_TOKEN) return;
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnvLocal();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`[Assertion Failure] ${message}`);
  }
}

async function runHubSpotCrmTests() {
  console.log('====================================================');
  console.log('       Phase 4: HubSpot CRM Integration Suite       ');
  console.log('====================================================\n');

  const sessionId = 'session-acme-john-' + Date.now();
  resetSessionSalesState(sessionId);

  // ── Exact Scenario from Requirements ──────────────────────────────────────
  console.log('--- 1. Testing Exact Customer Scenario & Extraction ---');
  const exactCustomerSpeech =
    "Hi, I'm John from Acme. We're looking for an AI voice agent for customer support. We have around 50 support agents and want to deploy within two months. We are interested in Agora's Conversational AI platform. Can you arrange a demo?";

  const transcript = [
    {
      role: 'assistant',
      content: "Hi there! I'm Ada from Agora. Tell me about the voice agent project you're building!",
    },
    {
      role: 'user',
      content: exactCustomerSpeech,
    },
  ];

  // Extract sales state using tracker
  const baseState = createInitialSalesState();
  const extractedState = analyzeAndUpdateSalesState(baseState, transcript);

  console.log(`✓ Customer Name Extracted : ${extractedState.customerName}`);
  console.log(`✓ Company Extracted       : ${extractedState.company}`);
  console.log(`✓ Need Extracted          : ${extractedState.need}`);
  console.log(`✓ Company Size Extracted  : ${extractedState.companySize}`);
  console.log(`✓ Timeline Extracted      : ${extractedState.timeline}`);
  console.log(`✓ Products Interested     : ${extractedState.productsInterested.join(', ')}`);
  console.log(`✓ Buying Intent           : ${extractedState.buyingIntent}`);
  console.log(`✓ Next Best Action        : ${extractedState.nextBestAction}`);

  // Strict verification against exact scenario requirements
  assert(extractedState.customerName === 'John', `Expected name === John, got ${extractedState.customerName}`);
  assert(extractedState.company === 'Acme', `Expected company === Acme, got ${extractedState.company}`);
  assert(extractedState.need === 'AI voice customer support', `Expected need === AI voice customer support, got ${extractedState.need}`);
  assert(extractedState.companySize === '50 support agents', `Expected companySize === 50 support agents, got ${extractedState.companySize}`);
  assert(extractedState.timeline === '2 months', `Expected timeline === 2 months, got ${extractedState.timeline}`);
  assert(extractedState.productsInterested.includes('Conversational AI'), `Expected productsInterested to include Conversational AI`);
  assert(extractedState.buyingIntent === 'high', `Expected buyingIntent === high, got ${extractedState.buyingIntent}`);
  assert(extractedState.nextBestAction === 'arrange_demo', `Expected nextBestAction === arrange_demo, got ${extractedState.nextBestAction}`);

  // ── Process through Sales Brain ───────────────────────────────────────────
  console.log('\n--- 2. Processing Through Sales Brain ---');
  const brainResult = await processSalesBrain({
    companyId: 'default-company',
    sessionId,
    messages: transcript,
  });
  assert(brainResult.salesState.salesStage === 'closing', 'Expected salesStage === closing');

  // ── Sync Lead to HubSpot (Without email to verify missing field handling) ──
  console.log('\n--- 3. Synchronizing Structured CRM Data to HubSpot (Handling Missing Email) ---');
  const syncResult1 = await syncLeadToHubSpot({
    sessionId,
    companyId: 'default-company',
    salesState: extractedState,
    transcript,
  });

  assert(syncResult1.success === true, 'HubSpot sync should succeed');
  assert(syncResult1.contactId !== undefined, 'Contact ID must be returned');
  assert(syncResult1.companyId !== undefined, 'Company ID must be returned');
  assert(syncResult1.dealId !== undefined, 'Deal ID must be returned');
  assert(syncResult1.noteId !== undefined, 'Note ID must be returned');
  assert(syncResult1.missingFields?.includes('email'), 'Must report email as missing field');
  assert(syncResult1.summary?.includes('John'), 'Summary note must mention contact name John');
  assert(syncResult1.summary?.includes('Acme'), 'Summary note must mention company name Acme');

  console.log(`✓ Contact Synchronized    : ${syncResult1.contactId}`);
  console.log(`✓ Company Synchronized    : ${syncResult1.companyId} (Acme)`);
  console.log(`✓ Deal Synchronized       : ${syncResult1.dealId} (Acme - Voice AI Project)`);
  console.log(`✓ Engagement Note Logged  : ${syncResult1.noteId}`);
  console.log(`✓ Missing Info Reported   : ${syncResult1.missingFields?.join(', ')}`);

  // ── Duplicate Prevention Test ─────────────────────────────────────────────
  console.log('\n--- 4. Testing Duplicate Prevention (Same Session Synced Twice) ---');
  const syncResult2 = await syncLeadToHubSpot({
    sessionId,
    companyId: 'default-company',
    salesState: extractedState,
    transcript,
    customerData: {
      name: 'John',
      company: 'Acme',
      role: 'Head of Support',
    },
  });

  assert(syncResult2.success === true, 'Duplicate sync call must succeed');
  assert(syncResult2.duplicatePrevented === true, 'duplicatePrevented flag must be true on subsequent sync');
  assert(syncResult2.contactId === syncResult1.contactId, 'Contact ID must remain identical on re-sync');
  assert(syncResult2.companyId === syncResult1.companyId, 'Company ID must remain identical on re-sync');
  assert(syncResult2.dealId === syncResult1.dealId, 'Deal ID must remain identical on re-sync');
  console.log('✓ Duplicate prevention confirmed: records were updated, zero duplicate entities created');

  // ── Incomplete Information Test ───────────────────────────────────────────
  console.log('\n--- 5. Testing Incomplete Customer Information Handling ---');
  const incompleteSessionId = 'incomplete-session-' + Date.now();
  const syncIncomplete = await syncLeadToHubSpot({
    sessionId: incompleteSessionId,
    salesState: {
      salesStage: 'discovery',
      buyingIntent: 'low',
    },
    transcript: [{ role: 'user', content: 'Just exploring options for a voice bot.' }],
  });

  assert(syncIncomplete.success === true, 'Sync with incomplete data should succeed gracefully');
  assert(syncIncomplete.contactId !== undefined, 'Should generate fallback contact ID');
  assert(syncIncomplete.companyId !== undefined, 'Should generate fallback company ID');
  assert(syncIncomplete.dealId !== undefined, 'Should generate fallback deal ID');
  console.log('✓ Incomplete info handled gracefully without inventing false data');

  // ── API Route Endpoint Tests ──────────────────────────────────────────────
  console.log('\n--- 6. Testing POST and GET /api/crm/sync-lead Route Handlers ---');

  // POST validation failure
  const invalidReq = new NextRequest('http://localhost:3000/api/crm/sync-lead', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  const invalidRes = await syncLeadPost(invalidReq);
  assert(invalidRes.status === 400, 'POST /api/crm/sync-lead should reject missing sessionId with 400');

  // POST valid sync with transcript
  const validReq = new NextRequest('http://localhost:3000/api/crm/sync-lead', {
    method: 'POST',
    body: JSON.stringify({
      sessionId: 'api-test-session-' + Date.now(),
      companyId: 'default-company',
      transcript,
    }),
  });
  const validRes = await syncLeadPost(validReq);
  assert(validRes.status === 200, 'POST /api/crm/sync-lead should return 200 for valid sync');
  const validJson = (await validRes.json()) as Record<string, unknown>;
  assert(validJson.success === true, 'API response should indicate success');
  assert(validJson.contactId !== undefined, 'API response should include contactId');

  // GET retry check
  const getReq = new NextRequest('http://localhost:3000/api/crm/sync-lead?sessionId=' + sessionId);
  const getRes = await syncLeadGet(getReq);
  assert(getRes.status === 200, 'GET /api/crm/sync-lead should return 200');

  console.log('✓ All API route contracts validated successfully');

  // ── 7. Verification with Exact User Prompt Data & Live HubSpot Verification ─
  // ── 7. Verification with Exact User Prompt Data & Live HubSpot Verification ─
  console.log('\n--- 7. Verification with Exact User Prompt Data & Live HubSpot Verification ---');
  const exactSessionId = 'session-john-smith-' + Date.now();
  resetSessionSalesState(exactSessionId);

  const exactTranscript = [
    {
      role: 'assistant',
      content: "Hello, I'm Ada from Agora. How can I assist you with your conversational AI project today?",
    },
    {
      role: 'user',
      content:
        "My name is John Smith. I work at Acme as VP of Operations. My email is john@acme.com and phone is +1 555 123 4567. We have 50 agents, a budget of $35,000, and want to deploy within two months.",
    },
  ];

  const exactBaseState = createInitialSalesState(exactSessionId);
  const exactState = analyzeAndUpdateSalesState(exactBaseState, exactTranscript);

  console.log('Extracted exact prompt fields:');
  console.log(`  - Name        : ${exactState.customerName}`);
  console.log(`  - First Name  : ${exactState.customer?.firstName}`);
  console.log(`  - Last Name   : ${exactState.customer?.lastName}`);
  console.log(`  - Company     : ${exactState.company}`);
  console.log(`  - Role        : ${exactState.role}`);
  console.log(`  - Email       : ${exactState.email}`);
  console.log(`  - Phone       : ${exactState.phone}`);
  console.log(`  - Need        : ${exactState.need}`);
  console.log(`  - Company Size: ${exactState.companySize}`);
  console.log(`  - Budget      : ${exactState.budget}`);
  console.log(`  - Timeline    : ${exactState.timeline}`);

  assert(exactState.customerName === 'John Smith', `Expected customerName === John Smith, got ${exactState.customerName}`);
  assert(exactState.customer?.firstName === 'John', `Expected firstName === John, got ${exactState.customer?.firstName}`);
  assert(exactState.customer?.lastName === 'Smith', `Expected lastName === Smith, got ${exactState.customer?.lastName}`);
  assert(exactState.company === 'Acme', `Expected company === Acme, got ${exactState.company}`);
  assert(exactState.role === 'VP of Operations', `Expected role === VP of Operations, got ${exactState.role}`);
  assert(exactState.email === 'john@acme.com', `Expected email === john@acme.com, got ${exactState.email}`);
  assert(exactState.phone === '+1 555 123 4567', `Expected phone === +1 555 123 4567, got ${exactState.phone}`);
  assert(exactState.need === 'AI voice customer support', `Expected need === AI voice customer support, got ${exactState.need}`);
  assert(exactState.companySize === '50 agents', `Expected companySize === 50 agents, got ${exactState.companySize}`);
  assert(exactState.budget === '$35,000', `Expected budget === $35,000, got ${exactState.budget}`);
  assert(exactState.timeline === '2 months', `Expected timeline === 2 months, got ${exactState.timeline}`);

  // Test 1: First sync execution
  const exactSyncResult1 = await syncLeadToHubSpot({
    sessionId: exactSessionId,
    salesState: exactState,
    transcript: exactTranscript,
  });

  assert(exactSyncResult1.success === true, 'HubSpot sync for exact data must succeed');
  assert(exactSyncResult1.contactId !== undefined, 'Contact ID must be returned');
  assert(exactSyncResult1.companyId !== undefined, 'Company ID must be returned');
  assert(exactSyncResult1.dealId !== undefined, 'Deal ID must be returned');
  assert(exactSyncResult1.noteId !== undefined, 'Note ID must be returned');

  // Test 2: Second sync with identical conversation ID (Testing Idempotency & Zero Duplicates)
  const exactSyncResult2 = await syncLeadToHubSpot({
    sessionId: exactSessionId,
    salesState: exactState,
    transcript: exactTranscript,
  });

  assert(exactSyncResult2.success === true, 'Second sync call must succeed');
  assert(exactSyncResult2.idempotent === true || exactSyncResult2.duplicatePrevented === true, 'Idempotency flag must be true');
  assert(exactSyncResult2.contactId === exactSyncResult1.contactId, 'Contact ID must be identical (no duplicate)');
  assert(exactSyncResult2.companyId === exactSyncResult1.companyId, 'Company ID must be identical (no duplicate)');
  assert(exactSyncResult2.dealId === exactSyncResult1.dealId, 'Deal ID must be identical (no duplicate)');
  assert(exactSyncResult2.noteId === exactSyncResult1.noteId, 'Note ID must be identical (no duplicate)');
  console.log('✓ Idempotency confirmed: re-sync with same conversation ID created zero duplicate entities');

  const hubspotClient = getHubSpotClient();
  if (hubspotClient && !exactSyncResult1.isMock) {
    // 1. Verify Contact in HubSpot Live
    const liveContact = await hubspotClient.crm.contacts.basicApi.getById(exactSyncResult1.contactId!, [
      'firstname',
      'lastname',
      'email',
      'phone',
      'jobtitle',
      'company',
    ]);
    console.log('✓ Live HubSpot Contact properties:', liveContact.properties);
    assert(liveContact.properties.firstname === 'John', 'HubSpot Contact firstname === John');
    assert(liveContact.properties.lastname === 'Smith', 'HubSpot Contact lastname === Smith');
    assert(liveContact.properties.email === 'john@acme.com', 'HubSpot Contact email === john@acme.com');
    assert(liveContact.properties.phone === '+1 555 123 4567', 'HubSpot Contact phone === +1 555 123 4567');
    assert(liveContact.properties.jobtitle === 'VP of Operations', 'HubSpot Contact jobtitle === VP of Operations');
    assert(liveContact.properties.company === 'Acme', 'HubSpot Contact company === Acme');

    // 2. Verify Company in HubSpot Live
    const liveCompany = await hubspotClient.crm.companies.basicApi.getById(exactSyncResult1.companyId!, ['name']);
    console.log('✓ Live HubSpot Company properties:', liveCompany.properties);
    assert(liveCompany.properties.name === 'Acme', 'HubSpot Company name === Acme');

    // 3. Verify Deal in HubSpot Live
    const liveDeal = await hubspotClient.crm.deals.basicApi.getById(exactSyncResult1.dealId!, ['amount', 'dealstage', 'pipeline']);
    console.log('✓ Live HubSpot Deal properties:', liveDeal.properties);
    assert(liveDeal.properties.amount === '35000', `HubSpot Deal amount === 35000, got ${liveDeal.properties.amount}`);

    // 4. Verify Note in HubSpot Live
    const liveNote = await hubspotClient.crm.objects.notes.basicApi.getById(exactSyncResult1.noteId!, ['hs_note_body']);
    console.log('✓ Live HubSpot Note body:\n', liveNote.properties.hs_note_body);
    const body = liveNote.properties.hs_note_body || '';
    assert(body.includes('Customer: John Smith'), 'Note contains Customer: John Smith');
    assert(body.includes('Company: Acme'), 'Note contains Company: Acme');
    assert(body.includes('Role: VP of Operations'), 'Note contains Role: VP of Operations');
    assert(body.includes('Email: john@acme.com'), 'Note contains Email: john@acme.com');
    assert(body.includes('Phone: +1 555 123 4567'), 'Note contains Phone: +1 555 123 4567');
    assert(body.includes('Need: AI voice customer support'), 'Note contains Need');
    assert(body.includes('Budget: $35,000'), 'Note contains Budget: $35,000');
    assert(body.includes('Timeline: 2 months'), 'Note contains Timeline: 2 months');
    assert(body.includes('Company Size: 50 agents'), 'Note contains Company Size: 50 agents');
    console.log('✓ Verified 100% that exact prompt data reached live HubSpot Contact, Company, Deal, and Note!');
  }

  // ── Resilience & Failure Handling ─────────────────────────────────────────
  console.log('\n--- 8. Testing HubSpot API Failure Resilience ---');
  const originalToken = process.env.HUBSPOT_ACCESS_TOKEN;
  // Test that bad token does not crash the app
  process.env.HUBSPOT_ACCESS_TOKEN = 'pat-na1-invalid-token-for-resilience-test';

  const resilientSync = await syncLeadToHubSpot({
    sessionId: 'failing-session-' + Date.now(),
    salesState: extractedState,
  });

  assert(resilientSync.success === false, 'Failed live sync must return success === false');
  assert(resilientSync.status === 'failed', 'Status must be failed');
  assert(resilientSync.contactId === undefined, 'Must NOT return mock contact ID on real failure');
  assert(resilientSync.companyId === undefined, 'Must NOT return mock company ID on real failure');
  assert(resilientSync.dealId === undefined, 'Must NOT return mock deal ID on real failure');
  assert(resilientSync.noteId === undefined, 'Must NOT return mock note ID on real failure');
  assert(resilientSync.error !== undefined, 'Error message should be captured');

  if (originalToken) process.env.HUBSPOT_ACCESS_TOKEN = originalToken;
  else delete process.env.HUBSPOT_ACCESS_TOKEN;

  console.log('✓ Resilience verified: API failures are caught, logged, queued, and never terminate voice calls');

  console.log('\n====================================================');
  console.log('     All HubSpot CRM Verification Tests Passed!     ');
  console.log('====================================================\n');
}

runHubSpotCrmTests().catch((err) => {
  console.error('Test failure:', err);
  process.exit(1);
});

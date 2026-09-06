import fs from 'node:fs';
import path from 'node:path';
import { syncLeadToHubSpot } from '../lib/hubspot';

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

async function testDuplicatePrevention() {
  console.log('[TEST DUPLICATE PREVENTION IN REAL HUBSPOT]');

  const testEmail = `duplicate-test-${Date.now()}@example.com`;
  const companyName = 'Duplicate Test Labs';

  console.log(`\n--- First Request: Creating Contact with email ${testEmail} ---`);
  const result1 = await syncLeadToHubSpot({
    sessionId: `dup-test-sess-1-${Date.now()}`,
    customerData: {
      name: 'Eleanor Vance',
      email: testEmail,
      company: companyName,
      role: 'Head of Customer Experience',
    },
    salesState: {
      need: 'Conversational Voice AI Evaluation',
      buyingIntent: 'high',
      salesStage: 'qualification',
    },
  });

  if (!result1.success || !result1.hubspot?.contactId) {
    throw new Error(`First sync failed: ${result1.error}`);
  }

  const contactId1 = result1.hubspot.contactId;
  console.log(`✓ First Request Success: Contact ID = ${contactId1}`);
  console.log(`✓ duplicatePrevented = ${result1.duplicatePrevented}`);

  console.log(`\n--- Second Request: Submitting SAME email ${testEmail} ---`);
  const result2 = await syncLeadToHubSpot({
    sessionId: `dup-test-sess-2-${Date.now()}`,
    customerData: {
      name: 'Eleanor Vance',
      email: testEmail,
      company: companyName,
      role: 'VP of Customer Experience', // updated role
    },
    salesState: {
      need: 'Conversational Voice AI Expansion',
      buyingIntent: 'high',
      salesStage: 'closing',
    },
  });

  if (!result2.success || !result2.hubspot?.contactId) {
    throw new Error(`Second sync failed: ${result2.error}`);
  }

  const contactId2 = result2.hubspot.contactId;
  console.log(`✓ Second Request Success: Contact ID = ${contactId2}`);
  console.log(`✓ duplicatePrevented = ${result2.duplicatePrevented}`);

  if (contactId1 !== contactId2) {
    throw new Error(`Duplicate created! Expected ${contactId1}, but got ${contactId2}`);
  }

  if (result2.duplicatePrevented !== true) {
    throw new Error(`Expected duplicatePrevented === true on second request`);
  }

  console.log('\n=============================================================');
  console.log('✓ Duplicate Prevention Verified: Contact was updated, 0 duplicates created');
  console.log(`✓ Verified Single HubSpot Contact ID: ${contactId1}`);
  console.log('=============================================================\n');
}

testDuplicatePrevention().catch((err) => {
  console.error('Duplicate test failed:', err);
  process.exit(1);
});

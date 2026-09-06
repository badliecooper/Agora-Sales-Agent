import fs from 'node:fs';
import path from 'node:path';
import { Client } from '@hubspot/api-client';

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

async function verifyRealRecords() {
  const token = process.env.HUBSPOT_ACCESS_TOKEN?.trim();
  if (!token) throw new Error('Missing token');
  const client = new Client({ accessToken: token });

  const contactId = '546599498463';
  const companyId = '344183494365';
  const dealId = '346022190813';
  const noteId = '397121723105';

  console.log('[VERIFYING REAL RECORDS IN HUBSPOT CLOUD]');

  // 1. Verify Contact
  const contact = await client.crm.contacts.basicApi.getById(contactId, [
    'firstname',
    'lastname',
    'company',
    'jobtitle',
  ]);
  console.log('✓ Contact Verified in HubSpot:');
  console.log(`  - ID: ${contact.id}`);
  console.log(`  - Name: ${contact.properties.firstname} ${contact.properties.lastname}`);
  console.log(`  - Company: ${contact.properties.company}`);

  // 2. Verify Company
  const company = await client.crm.companies.basicApi.getById(companyId, [
    'name',
    'description',
  ]);
  console.log('\n✓ Company Verified in HubSpot:');
  console.log(`  - ID: ${company.id}`);
  console.log(`  - Name: ${company.properties.name}`);
  console.log(`  - Description: ${company.properties.description}`);

  // 3. Verify Deal
  const deal = await client.crm.deals.basicApi.getById(dealId, [
    'dealname',
    'dealstage',
    'amount',
    'pipeline',
  ]);
  console.log('\n✓ Deal Verified in HubSpot:');
  console.log(`  - ID: ${deal.id}`);
  console.log(`  - Name: ${deal.properties.dealname}`);
  console.log(`  - Stage: ${deal.properties.dealstage}`);
  console.log(`  - Amount: $${deal.properties.amount}`);

  // 4. Verify Note
  const note = await client.crm.objects.notes.basicApi.getById(noteId, [
    'hs_note_body',
    'hs_timestamp',
  ]);
  console.log('\n✓ Note Verified in HubSpot:');
  console.log(`  - ID: ${note.id}`);
  console.log(`  - Preview: ${note.properties.hs_note_body?.slice(0, 100)}...`);

  console.log('\n============================================================');
  console.log('ALL 4 REAL RECORDS CONFIRMED ACTIVE IN USER HUBSPOT ACCOUNT!');
  console.log('============================================================\n');
}

verifyRealRecords().catch((e) => {
  console.error('Verification failed:', e);
  process.exit(1);
});

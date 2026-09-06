import fs from 'node:fs';
import path from 'node:path';
import { getHubSpotClient } from '../lib/hubspot';

// Ensure .env.local is loaded
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

async function main() {
  console.log('[HUBSPOT REAL TEST]');

  const client = getHubSpotClient();
  if (!client) {
    console.error('Error: Failed to initialize HubSpot client. HUBSPOT_ACCESS_TOKEN is missing or invalid.');
    process.exit(1);
  }

  const timestamp = Date.now();
  const testContact = {
    firstname: 'AgoraTest',
    lastname: 'Lead',
    email: `agora-test-${timestamp}@example.com`,
    company: 'Agora Demo Test',
    jobtitle: 'AI Sales Agent Test',
  };

  try {
    // 1. Create Contact using official HubSpot API Client
    const createdContact = await client.crm.contacts.basicApi.create({
      properties: testContact,
      associations: [],
    });

    const contactId = createdContact.id;
    if (!contactId || contactId.startsWith('mock-')) {
      throw new Error(`Invalid or mock contact ID returned: ${contactId}`);
    }

    console.log('Contact created successfully');
    console.log(`Contact ID: ${contactId}`);

    // 2. Verify / Retrieve the contact from HubSpot API
    const retrievedContact = await client.crm.contacts.basicApi.getById(
      contactId,
      ['firstname', 'lastname', 'email', 'company', 'jobtitle'],
    );

    if (!retrievedContact || retrievedContact.id !== contactId) {
      throw new Error(`Retrieved contact ID mismatch or not found: ${retrievedContact?.id}`);
    }

    console.log('Contact creation: SUCCESS');
    console.log('Contact retrieval: SUCCESS');
    console.log(`Contact ID: ${retrievedContact.id}`);
    console.log(`Verified Email: ${retrievedContact.properties.email}`);
    console.log(`Verified Name: ${retrievedContact.properties.firstname} ${retrievedContact.properties.lastname}`);
    console.log(`Verified Company: ${retrievedContact.properties.company}`);

    process.exit(0);
  } catch (error) {
    const err = error as {
      statusCode?: number;
      code?: number;
      message?: string;
      body?: {
        status?: string;
        message?: string;
        category?: string;
      };
    };

    const statusCode = err.statusCode || err.code || 500;
    const category = err.body?.category || 'UNKNOWN';
    const reason = err.body?.message || err.message || 'Unknown error occurred';

    console.error('Contact creation: FAILED');
    console.error(`HTTP Status: ${statusCode}`);
    console.error(`Error Category: ${category}`);
    console.error(`Reason: ${reason}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unexpected test error:', err.message);
  process.exit(1);
});

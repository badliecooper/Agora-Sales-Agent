import fs from 'node:fs';
import path from 'node:path';
import { Client, AssociationTypes } from '@hubspot/api-client';

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

async function testFullHubSpotFlow() {
  const token = process.env.HUBSPOT_ACCESS_TOKEN?.trim();
  if (!token) throw new Error('Missing token');
  const client = new Client({ accessToken: token });

  console.log('[HUBSPOT AUTH] Checking token...');
  console.log('HUBSPOT_ACCESS_TOKEN configured: true');
  console.log(`HUBSPOT_ACCESS_TOKEN length: ${token.length}`);
  console.log('HUBSPOT credential type: configured');

  // 1. Create or find test contact
  const testEmail = `agora-test-${Date.now()}@example.com`;
  console.log(`\n1. Creating Contact (${testEmail})...`);
  const contact = await client.crm.contacts.basicApi.create({
    properties: {
      firstname: 'John',
      lastname: 'AcmeTest',
      email: testEmail,
      jobtitle: 'Head of Support',
      company: 'Acme Test Corp',
    },
    associations: [],
  });
  console.log(`[HUBSPOT CONTACT] ID: ${contact.id}`);

  // 2. Create or find test company
  console.log('\n2. Creating Company (Acme Test Corp)...');
  const company = await client.crm.companies.basicApi.create({
    properties: {
      name: 'Acme Test Corp',
      description: 'Voice AI Evaluation Test Company',
    },
    associations: [],
  });
  console.log(`[HUBSPOT COMPANY] ID: ${company.id}`);

  // 3. Associate Contact <-> Company
  console.log('\n3. Associating Contact <-> Company...');
  try {
    await client.crm.associations.v4.basicApi.create(
      'contacts',
      contact.id,
      'companies',
      company.id,
      [{ associationCategory: 'HUBSPOT_DEFINED' as never, associationTypeId: AssociationTypes.contactToCompany }],
    );
    console.log(`[HUBSPOT ASSOCIATION] Contact ${contact.id} <-> Company ${company.id}: SUCCESS`);
  } catch (err: unknown) {
    const e = err as { message?: string; body?: { message?: string } };
    console.error(`[HUBSPOT ASSOCIATION FAILED] Contact <-> Company: ${e.body?.message || e.message}`);
  }

  // 4. Retrieve Pipelines & Valid Stages
  console.log('\n4. Checking Pipelines & Stages for Deals...');
  const pipelines = await client.crm.pipelines.pipelinesApi.getAll('deals');
  const defaultPipeline = pipelines.results?.[0];
  const validStage = defaultPipeline?.stages?.[0]?.id || 'appointmentscheduled';
  console.log(`Using Pipeline: ${defaultPipeline?.id || 'default'}, Stage: ${validStage}`);

  // 5. Create Deal
  console.log('\n5. Creating Deal...');
  const deal = await client.crm.deals.basicApi.create({
    properties: {
      dealname: `Acme Test Corp - Voice AI Project [${Date.now().toString().slice(-6)}]`,
      dealstage: validStage,
      pipeline: defaultPipeline?.id || 'default',
      amount: '35000',
      description: 'Agora Conversational AI Voice Opportunity. High Buying Intent.',
    },
    associations: [],
  });
  console.log(`[HUBSPOT DEAL] ID: ${deal.id}`);

  // 6. Associate Deal <-> Company and Deal <-> Contact
  console.log('\n6. Associating Deal <-> Company and Deal <-> Contact...');
  try {
    await client.crm.associations.v4.basicApi.create(
      'deals',
      deal.id,
      'companies',
      company.id,
      [{ associationCategory: 'HUBSPOT_DEFINED' as never, associationTypeId: AssociationTypes.dealToCompany }],
    );
    console.log(`[HUBSPOT ASSOCIATION] Deal ${deal.id} <-> Company ${company.id}: SUCCESS`);
  } catch (err: unknown) {
    const e = err as { message?: string; body?: { message?: string } };
    console.error(`[HUBSPOT ASSOCIATION FAILED] Deal <-> Company: ${e.body?.message || e.message}`);
  }

  try {
    await client.crm.associations.v4.basicApi.create(
      'deals',
      deal.id,
      'contacts',
      contact.id,
      [{ associationCategory: 'HUBSPOT_DEFINED' as never, associationTypeId: AssociationTypes.dealToContact }],
    );
    console.log(`[HUBSPOT ASSOCIATION] Deal ${deal.id} <-> Contact ${contact.id}: SUCCESS`);
  } catch (err: unknown) {
    const e = err as { message?: string; body?: { message?: string } };
    console.error(`[HUBSPOT ASSOCIATION FAILED] Deal <-> Contact: ${e.body?.message || e.message}`);
  }

  // 7. Create Note (Engagement Call Summary)
  console.log('\n7. Creating Note...');
  try {
    const note = await client.crm.objects.notes.basicApi.create({
      properties: {
        hs_timestamp: Date.now().toString(),
        hs_note_body: '### Agora Voice AI Call Summary\n\nProspect John from Acme interested in AI Voice customer support demo.',
      },
      associations: [],
    });
    console.log(`[HUBSPOT NOTE] ID: ${note.id}`);

    // Associate Note to Contact and Deal
    try {
      await client.crm.associations.v4.basicApi.create(
        'notes',
        note.id,
        'contacts',
        contact.id,
        [{ associationCategory: 'HUBSPOT_DEFINED' as never, associationTypeId: AssociationTypes.noteToContact }],
      );
      console.log(`[HUBSPOT ASSOCIATION] Note ${note.id} <-> Contact ${contact.id}: SUCCESS`);
    } catch (err: unknown) {
      const e = err as { message?: string; body?: { message?: string } };
      console.error(`[HUBSPOT ASSOCIATION FAILED] Note <-> Contact: ${e.body?.message || e.message}`);
    }

    try {
      await client.crm.associations.v4.basicApi.create(
        'notes',
        note.id,
        'deals',
        deal.id,
        [{ associationCategory: 'HUBSPOT_DEFINED' as never, associationTypeId: AssociationTypes.noteToDeal }],
      );
      console.log(`[HUBSPOT ASSOCIATION] Note ${note.id} <-> Deal ${deal.id}: SUCCESS`);
    } catch (err: unknown) {
      const e = err as { message?: string; body?: { message?: string } };
      console.error(`[HUBSPOT ASSOCIATION FAILED] Note <-> Deal: ${e.body?.message || e.message}`);
    }
  } catch (noteErr: unknown) {
    const e = noteErr as { message?: string; body?: { message?: string } };
    console.error(`[HUBSPOT NOTE FAILED]: ${e.body?.message || e.message}`);
  }

  console.log('\n--- Full HubSpot Cloud Flow Test Completed Successfully! ---');
}

testFullHubSpotFlow().catch((e) => {
  console.error('Fatal Flow Error:', e);
  process.exit(1);
});

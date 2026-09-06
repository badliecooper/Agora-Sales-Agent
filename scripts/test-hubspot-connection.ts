import fs from 'node:fs';
import path from 'node:path';
import { Client } from '@hubspot/api-client';

// Load .env.local if not already in environment
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
  console.log('[HUBSPOT TEST]');

  const token = process.env.HUBSPOT_ACCESS_TOKEN?.trim();
  if (!token) {
    console.log('Credential configured: NO');
    console.log('Authentication: FAILED');
    console.log('Reason: HUBSPOT_ACCESS_TOKEN is missing from environment or .env.local');
    process.exit(1);
  }

  console.log('Credential configured: YES');
  console.log(`Token length: ${token.length}`);
  console.log(`Credential prefix: ${token.slice(0, 4)}...`);

  const client = new Client({ accessToken: token });

  try {
    // Harmless request to verify authentication & scopes
    const contactsPage = await client.crm.contacts.basicApi.getPage(1);
    console.log('Authentication: SUCCESS');
    console.log('CRM API: ACCESSIBLE');
    console.log(`Total contacts visible or retrieved in page: ${contactsPage.results?.length ?? 0}`);

    // Also check deals/pipelines accessibility safely
    try {
      const pipelines = await client.crm.pipelines.pipelinesApi.getAll('deals');
      console.log(`Deal Pipelines accessible: YES (${pipelines.results?.length ?? 0} pipeline(s))`);
      if (pipelines.results && pipelines.results.length > 0) {
        const defaultPipeline = pipelines.results[0];
        console.log(`Default Deal Pipeline: ${defaultPipeline.label} (ID: ${defaultPipeline.id})`);
        console.log(`Available Stages: ${defaultPipeline.stages.map((s) => `${s.label} [${s.id}]`).join(', ')}`);
      }
    } catch (pipeErr) {
      const pErr = pipeErr as { statusCode?: number; message?: string; body?: { message?: string } };
      console.log(`Deal Pipelines check: Non-fatal notice (${pErr.statusCode || 'N/A'}: ${pErr.body?.message || pErr.message})`);
    }

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
        correlationId?: string;
      };
    };

    const statusCode = err.statusCode || err.code || 500;
    const category = err.body?.category || 'UNKNOWN';
    const reason = err.body?.message || err.message || 'Unknown error occurred';

    console.log('Authentication: FAILED');
    console.log(`HTTP status: ${statusCode}`);
    console.log(`Error Category: ${category}`);
    console.log(`Reason: ${reason}`);

    if (statusCode === 401) {
      console.log('Analysis: The HUBSPOT_ACCESS_TOKEN is expired or invalid.');
    } else if (statusCode === 403) {
      console.log('Analysis: The Private App token is missing required scopes in HubSpot.');
      console.log('Required Scopes: crm.objects.contacts.read, crm.objects.contacts.write, crm.objects.companies.read, crm.objects.companies.write, crm.objects.deals.read, crm.objects.deals.write');
    }

    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unexpected test error:', err.message);
  process.exit(1);
});

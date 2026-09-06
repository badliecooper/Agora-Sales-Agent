import fs from 'node:fs';
import path from 'node:path';

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
  console.log('[TEST POST /api/crm/sync-lead]');

  const payload = {
    sessionId: `manual-debug-test-${Date.now()}`,
    transcript: [
      {
        role: 'user',
        content:
          "Hi, I'm John from Acme. We're looking for an AI voice agent for customer support. We have around 50 support agents and want to deploy within two months. We're interested in Agora's Conversational AI platform. Can you arrange a demo?",
      },
    ],
  };

  console.log('Sending payload to http://localhost:3000/api/crm/sync-lead...');
  const res = await fetch('http://localhost:3000/api/crm/sync-lead', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const json = await res.json();
  console.log(`HTTP Status: ${res.status}`);
  console.log('Response Body:', JSON.stringify(json, null, 2));

  if (res.status === 200 && json.success === true && json.hubspot) {
    console.log('\n✓ REAL HUBSPOT SYNC SUCCEEDED!');
    console.log(`✓ Real Contact ID : ${json.hubspot.contactId}`);
    console.log(`✓ Real Company ID : ${json.hubspot.companyId}`);
    console.log(`✓ Real Deal ID    : ${json.hubspot.dealId}`);
    console.log(`✓ Real Note ID    : ${json.hubspot.noteId}`);
  } else {
    console.error('\n✗ Real HubSpot Sync Failed!');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal Error:', err);
  process.exit(1);
});

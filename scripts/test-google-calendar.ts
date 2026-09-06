import { getGoogleOAuthConfig, getEnvLocalValues } from '../lib/calendar/oauth-helper';
import { checkCalendarAvailability } from '../lib/calendar/tools';

async function main() {
  console.log('====================================================');
  console.log('   Google Calendar Live Availability Verification   ');
  console.log('====================================================\n');

  const env = getEnvLocalValues();
  for (const [k, v] of Object.entries(env)) {
    if (!process.env[k]) {
      process.env[k] = v;
    }
  }

  const config = getGoogleOAuthConfig();

  if (!config.clientId || !config.clientSecret) {
    console.error('❌ Error: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing in .env.local');
    process.exit(1);
  }

  if (!config.refreshToken) {
    console.error('❌ Error: GOOGLE_REFRESH_TOKEN is missing in .env.local');
    console.log('\nPlease run the authorization flow first:');
    console.log('  pnpm run auth:google');
    console.log('Or visit in your browser:');
    console.log('  http://localhost:3000/api/auth/google/login\n');
    process.exit(1);
  }

  console.log('✓ Configuration detected:');
  console.log('  - GOOGLE_CLIENT_ID    : Set');
  console.log('  - GOOGLE_CLIENT_SECRET: Set (hidden)');
  console.log('  - GOOGLE_REFRESH_TOKEN: Set (hidden)');
  console.log('  - GOOGLE_CALENDAR_ID  :', config.calendarId);

  console.log('\nChecking live Google Calendar availability for tomorrow...');
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateStr = tomorrow.toISOString().split('T')[0];

  try {
    const result = await checkCalendarAvailability({
      date: dateStr,
      startTime: '14:00',
      endTime: '14:30',
      timezone: 'America/New_York',
    });

    console.log('\n====================================================');
    console.log('🎉 Live Google Calendar Check Succeeded!');
    console.log('  - Date Checked :', dateStr);
    console.log('  - Slot Window  : 2:00 PM – 2:30 PM (America/New_York)');
    console.log('  - Available    :', result.available);
    if (result.conflictReason) {
      console.log('  - Details      :', result.conflictReason);
    }
    console.log('====================================================\n');
  } catch (err) {
    console.error('\n❌ Google Calendar Check Failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});

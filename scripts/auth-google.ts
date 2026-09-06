import { exec } from 'node:child_process';
import { getGoogleOAuthConfig, getGoogleAuthUrl, getEnvLocalValues } from '../lib/calendar/oauth-helper';

async function main() {
  console.log('====================================================');
  console.log('    Google Calendar & Meet OAuth Authorization     ');
  console.log('====================================================\n');

  const config = getGoogleOAuthConfig();

  if (!config.clientId || !config.clientSecret) {
    console.error('❌ Error: Google OAuth credentials are not set.');
    console.log('\nPlease add the following to your .env.local file:');
    console.log('GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com');
    console.log('GOOGLE_CLIENT_SECRET=your_client_secret\n');
    console.log('Also ensure your Google Cloud Console Web Application has:');
    console.log('Authorized Redirect URI: http://localhost:3000/api/auth/google/callback\n');
    process.exit(1);
  }

  console.log('✓ GOOGLE_CLIENT_ID detected');
  console.log('✓ GOOGLE_CLIENT_SECRET detected');
  console.log('✓ Redirect URI:', config.redirectUri);

  const authUrl = getGoogleAuthUrl(config);

  console.log('\n----------------------------------------------------');
  console.log('Opening your browser to authorize Google Calendar...');
  console.log('If the browser does not open automatically, visit:');
  console.log('  http://localhost:3000/api/auth/google/login');
  console.log('----------------------------------------------------\n');

  // Attempt to open the default browser on Windows
  const openCmd = process.platform === 'win32'
    ? `start "" "${authUrl}"`
    : process.platform === 'darwin'
    ? `open "${authUrl}"`
    : `xdg-open "${authUrl}"`;

  exec(openCmd, (err) => {
    if (err) {
      console.log('Notice: Could not automatically launch browser. Please visit the link above.');
    }
  });

  console.log('Waiting for authorization to complete in your browser...');
  console.log('(The refresh token will be automatically saved to .env.local once approved)\n');

  // Poll .env.local until GOOGLE_REFRESH_TOKEN is saved
  let attempts = 0;
  const interval = setInterval(() => {
    attempts++;
    const env = getEnvLocalValues();
    if (env.GOOGLE_REFRESH_TOKEN) {
      clearInterval(interval);
      console.log('====================================================');
      console.log('🎉 SUCCESS! Google Calendar authorized successfully!');
      console.log('✓ GOOGLE_REFRESH_TOKEN has been saved to .env.local');
      console.log('====================================================\n');
      console.log('Run the verification test anytime with:');
      console.log('  pnpm run test:google\n');
      process.exit(0);
    }
    if (attempts > 120) { // 2 minute timeout
      clearInterval(interval);
      console.log('Timed out waiting for authorization. You can visit http://localhost:3000/api/auth/google/login whenever ready.');
      process.exit(0);
    }
  }, 1000);
}

main().catch((err) => {
  console.error('Error during OAuth flow:', err);
  process.exit(1);
});
